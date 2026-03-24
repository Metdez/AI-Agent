"""Coder agent — implements plan steps using tool-calling with a ReAct loop."""

import asyncio
import logging
import time
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from state import DeepDevState
from tools.file_ops import create_file_tools
from tools.shell import create_shell_tools
from tools.git_ops import create_git_tools
from config import AGENT_MODELS, MAX_TOOL_ITERATIONS
from persistence import save_state
from live_events import emit_live_event

log = logging.getLogger("deepdev.coder")

SYSTEM_PROMPT = """You are an expert programmer. Implement the given plan step precisely.

Use your tools to:
1. Read existing code to understand context
2. Write new files or modify existing ones
3. Run commands if needed (install deps, etc.)


When you're done implementing, respond with a brief summary of what you did. Do NOT call any more tools after you're satisfied with the implementation."""


def _extract_file_path(tool_call: dict) -> str | None:
    """Extract the file path from a tool call's args, if applicable."""
    args = tool_call.get("args", {})
    name = tool_call.get("name", "")
    if name in ("write_file", "read_file"):
        return args.get("path")
    return None


def _has_write_conflict(tool_calls: list[dict]) -> bool:
    """Check if any two tool calls write to the same file."""
    write_paths = []
    for tc in tool_calls:
        if tc.get("name") == "write_file":
            path = tc.get("args", {}).get("path")
            if path:
                if path in write_paths:
                    return True
                write_paths.append(path)
    return False


async def _execute_tool_call(tool_map: dict, tc: dict, ws_events: list, worker_id: str | None) -> tuple[str, str]:
    """Execute a single tool call and return (tool_call_id, result_str)."""
    tool_name = tc["name"]
    tool_args = tc["args"]

    tool_event = {
        "type": "tool_call",
        "timestamp": time.time(),
        "data": {"tool": tool_name, "args": tool_args},
    }
    if worker_id:
        tool_event["data"]["worker_id"] = worker_id
    ws_events.append(tool_event)
    emit_live_event(tool_event)

    if tool_name in tool_map:
        # Run synchronous tool in executor to not block the event loop
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, tool_map[tool_name].invoke, tool_args)
    else:
        result = f"Unknown tool: {tool_name}"

    return tc["id"], result


def coder_node(state: DeepDevState) -> dict:
    """Implement the current plan step using tool-calling."""
    try:
        repo_path = state["repo_path"]
        plan = state.get("plan", [])
        current_step = state.get("current_step", 0)
        files_modified = list(state.get("files_modified", []))
        ws_events = list(state.get("ws_events", []))
        worker_id = state.get("worker_id", None)

        # Use worktree_path if provided (for parallel execution), otherwise repo_path
        working_path = state.get("worktree_path", repo_path)

        if current_step >= len(plan):
            ws_events.append({
                "type": "status_change",
                "timestamp": time.time(),
                "data": {"status": "coding", "message": "All plan steps completed"},
            })
            return {
                "status": "coding",
                "current_step": current_step,
                "ws_events": ws_events,
            }

        step = plan[current_step]

        # Mark step as active
        plan[current_step] = {**step, "status": "active"}

        step_started_event = {
            "type": "step_started",
            "timestamp": time.time(),
            "data": {
                "step": step["step"],
                "description": step["description"],
                "files": step["files"],
            },
        }
        if worker_id:
            step_started_event["data"]["worker_id"] = worker_id
        ws_events.append(step_started_event)
        emit_live_event(step_started_event)

        # Build tools — use working_path for file/shell ops
        all_tools = (
            create_file_tools(working_path)
            + create_shell_tools(working_path)
            + create_git_tools(working_path)
        )

        model = AGENT_MODELS["coder"]
        llm = ChatAnthropic(model=model, temperature=0, max_tokens=16384)
        llm_with_tools = llm.bind_tools(all_tools)

        # Build the tool map for execution
        tool_map = {t.name: t for t in all_tools}

        # Build context about what to do
        error_analysis = state.get("error_analysis", "")
        context = f"Plan step {step['step']}: {step['description']}\nFiles to work on: {', '.join(step['files'])}"
        if error_analysis:
            context += f"\n\nPrevious error analysis (fix this):\n{error_analysis}"

        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=context),
        ]

        # ReAct loop: keep calling tools until LLM stops requesting them
        for iteration in range(MAX_TOOL_ITERATIONS):
            log.info(f"[Step {step['step']}] Iteration {iteration + 1}/{MAX_TOOL_ITERATIONS} — calling Claude API...")
            t0 = time.time()
            response = llm_with_tools.invoke(messages)
            elapsed = time.time() - t0
            messages.append(response)

            # Log token usage if available
            usage = getattr(response, "usage_metadata", None)
            if usage:
                log.info(f"[Step {step['step']}] API responded in {elapsed:.1f}s — tokens: input={usage.get('input_tokens', '?')}, output={usage.get('output_tokens', '?')}")
            else:
                log.info(f"[Step {step['step']}] API responded in {elapsed:.1f}s")

            if not response.tool_calls:
                log.info(f"[Step {step['step']}] No more tool calls — step complete")
                break

            log.info(f"[Step {step['step']}] {len(response.tool_calls)} tool call(s): {', '.join(tc['name'] for tc in response.tool_calls)}")

            # Decide: parallel or serial execution
            tool_calls = response.tool_calls
            use_parallel = len(tool_calls) > 1 and not _has_write_conflict(tool_calls)

            if use_parallel:
                log.info(f"[Step {step['step']}] Executing {len(tool_calls)} tool calls in parallel")
                # Collect results via asyncio.gather
                async def _run_parallel():
                    tasks = [
                        _execute_tool_call(tool_map, tc, ws_events, worker_id)
                        for tc in tool_calls
                    ]
                    return await asyncio.gather(*tasks)

                # Use existing event loop or create one
                try:
                    asyncio.get_running_loop()
                    # We're already in an async context — use nest_asyncio pattern
                    import nest_asyncio
                    nest_asyncio.apply()
                    results = asyncio.get_event_loop().run_until_complete(_run_parallel())
                except RuntimeError:
                    results = asyncio.run(_run_parallel())

                # Build a map of tool_call_id -> result
                result_map = {tc_id: res for tc_id, res in results}

                for tc in tool_calls:
                    tool_name = tc["name"]
                    tool_args = tc["args"]
                    result = result_map[tc["id"]]

                    # Log tool details
                    if tool_name == "write_file":
                        content_len = len(tool_args.get("content", ""))
                        log.info(f"  -> {tool_name}({tool_args.get('path', '?')}) [{content_len} chars]")
                    elif tool_name == "run_command":
                        log.info(f"  -> {tool_name}({tool_args.get('command', '?')})")
                    elif tool_name == "read_file":
                        log.info(f"  -> {tool_name}({tool_args.get('path', '?')})")
                    else:
                        log.info(f"  -> {tool_name}({list(tool_args.keys())})")

                    # Track file modifications
                    if tool_name == "write_file" and "path" in tool_args:
                        fpath = tool_args["path"]
                        content_len = len(tool_args.get("content", ""))
                        if content_len == 0:
                            log.warning(f"  !! Skipped empty write_file({fpath}) — likely truncated API response")
                            messages.append(ToolMessage(
                                content="Error: file content was empty. This likely means your previous response was too long and got truncated. Please write the file again with shorter content.",
                                tool_call_id=tc["id"],
                            ))
                            continue
                        if fpath not in files_modified:
                            files_modified.append(fpath)

                    # Stream terminal output in real-time
                    if tool_name == "run_command" and isinstance(result, dict):
                        terminal_event = {
                            "type": "terminal_output",
                            "timestamp": time.time(),
                            "data": {
                                "output": result.get("stdout", "") + result.get("stderr", ""),
                                "command": tool_args.get("command", ""),
                            },
                        }
                        if worker_id:
                            terminal_event["data"]["worker_id"] = worker_id
                        ws_events.append(terminal_event)
                        emit_live_event(terminal_event)

                    messages.append(ToolMessage(content=str(result), tool_call_id=tc["id"]))
            else:
                # Serial execution (original behavior, or write-write conflict fallback)
                if len(tool_calls) > 1 and _has_write_conflict(tool_calls):
                    log.info(f"[Step {step['step']}] Write-write conflict detected — falling back to serial execution")

                for tc in tool_calls:
                    tool_name = tc["name"]
                    tool_args = tc["args"]

                    # Log tool details
                    if tool_name == "write_file":
                        content_len = len(tool_args.get("content", ""))
                        log.info(f"  -> {tool_name}({tool_args.get('path', '?')}) [{content_len} chars]")
                    elif tool_name == "run_command":
                        log.info(f"  -> {tool_name}({tool_args.get('command', '?')})")
                    elif tool_name == "read_file":
                        log.info(f"  -> {tool_name}({tool_args.get('path', '?')})")
                    else:
                        log.info(f"  -> {tool_name}({list(tool_args.keys())})")

                    tool_event = {
                        "type": "tool_call",
                        "timestamp": time.time(),
                        "data": {"tool": tool_name, "args": tool_args},
                    }
                    if worker_id:
                        tool_event["data"]["worker_id"] = worker_id
                    ws_events.append(tool_event)
                    emit_live_event(tool_event)

                    t1 = time.time()
                    if tool_name in tool_map:
                        result = tool_map[tool_name].invoke(tool_args)
                    else:
                        result = f"Unknown tool: {tool_name}"
                    tool_elapsed = time.time() - t1
                    log.info(f"     completed in {tool_elapsed:.1f}s")

                    # Track file modifications — skip empty writes (truncated API response)
                    if tool_name == "write_file" and "path" in tool_args:
                        fpath = tool_args["path"]
                        content_len = len(tool_args.get("content", ""))
                        if content_len == 0:
                            log.warning(f"  !! Skipped empty write_file({fpath}) — likely truncated API response")
                            messages.append(ToolMessage(
                                content="Error: file content was empty. This likely means your previous response was too long and got truncated. Please write the file again with shorter content.",
                                tool_call_id=tc["id"],
                            ))
                            continue
                        if fpath not in files_modified:
                            files_modified.append(fpath)

                    # Stream terminal output in real-time
                    if tool_name == "run_command" and isinstance(result, dict):
                        terminal_event = {
                            "type": "terminal_output",
                            "timestamp": time.time(),
                            "data": {
                                "output": result.get("stdout", "") + result.get("stderr", ""),
                                "command": tool_args.get("command", ""),
                            },
                        }
                        if worker_id:
                            terminal_event["data"]["worker_id"] = worker_id
                        ws_events.append(terminal_event)
                        emit_live_event(terminal_event)

                    messages.append(ToolMessage(content=str(result), tool_call_id=tc["id"]))

        # Commit changes for this step
        git_tools = create_git_tools(working_path)
        commit_tool = next(t for t in git_tools if t.name == "git_commit")
        commit_result = commit_tool.invoke({"message": f"step {step['step']}: {step['description']}"})

        # Auto-push to remote after each step (skip for parallel workers —
        # they commit to temporary worktree branches that will be merged later)
        push_tool = next((t for t in git_tools if t.name == "git_push"), None)
        push_result = ""
        if push_tool and not worker_id:
            try:
                push_result = push_tool.invoke({})
            except Exception:
                push_result = "push skipped"

        git_event = {
            "type": "git_commit",
            "timestamp": time.time(),
            "data": {"message": f"{commit_result} | {push_result}"},
        }
        if worker_id:
            git_event["data"]["worker_id"] = worker_id
        ws_events.append(git_event)
        emit_live_event(git_event)

        # Mark step as done, advance
        plan[current_step] = {**step, "status": "done"}

        step_done_event = {
            "type": "step_completed",
            "timestamp": time.time(),
            "data": {"step": step["step"], "description": step["description"]},
        }
        if worker_id:
            step_done_event["data"]["worker_id"] = worker_id
        ws_events.append(step_done_event)
        emit_live_event(step_done_event)

        next_step = current_step + 1
        new_status = "coding" if next_step < len(plan) else "testing"

        # Persist progress so we can resume if interrupted
        # (skip for parallel workers — they write to ephemeral worktrees
        # and would race on the shared state.json file)
        if not worker_id:
            save_state({
                **state,
                "plan": plan,
                "current_step": next_step,
                "files_modified": files_modified,
                "status": new_status,
                "error_analysis": "",
            })

        return {
            "plan": plan,
            "current_step": next_step,
            "files_modified": files_modified,
            "status": new_status,
            "error_analysis": "",  # Clear any previous error analysis after successful step
            "messages": messages,
            "ws_events": ws_events,
        }

    except Exception as e:
        ws_events = list(state.get("ws_events", []))
        ws_events.append({
            "type": "error",
            "timestamp": time.time(),
            "data": {"message": f"Coder failed: {e}"},
        })
        return {
            "status": "failed",
            "ws_events": ws_events,
        }

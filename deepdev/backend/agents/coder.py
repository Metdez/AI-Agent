"""Coder agent — implements plan steps using tool-calling with a ReAct loop."""

import time
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from state import DeepDevState
from tools.file_ops import create_file_tools
from tools.shell import create_shell_tools
from tools.git_ops import create_git_tools
from config import MODEL, MAX_TOOL_ITERATIONS

SYSTEM_PROMPT = """You are an expert programmer. Implement the given plan step precisely.

Use your tools to:
1. Read existing code to understand context
2. Write new files or modify existing ones
3. Run commands if needed (install deps, etc.)

When you're done implementing, respond with a brief summary of what you did. Do NOT call any more tools after you're satisfied with the implementation."""


def coder_node(state: DeepDevState) -> dict:
    """Implement the current plan step using tool-calling."""
    try:
        repo_path = state["repo_path"]
        plan = state.get("plan", [])
        current_step = state.get("current_step", 0)
        files_modified = list(state.get("files_modified", []))
        ws_events = list(state.get("ws_events", []))

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

        ws_events.append({
            "type": "step_started",
            "timestamp": time.time(),
            "data": {
                "step": step["step"],
                "description": step["description"],
                "files": step["files"],
            },
        })

        # Build tools
        all_tools = (
            create_file_tools(repo_path)
            + create_shell_tools(repo_path)
            + create_git_tools(repo_path)
        )

        llm = ChatAnthropic(model=MODEL, temperature=0, max_tokens=8192)
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
            response = llm_with_tools.invoke(messages)
            messages.append(response)

            if not response.tool_calls:
                break

            # Execute each tool call
            for tc in response.tool_calls:
                tool_name = tc["name"]
                tool_args = tc["args"]

                ws_events.append({
                    "type": "tool_call",
                    "timestamp": time.time(),
                    "data": {"tool": tool_name, "args": tool_args},
                })

                if tool_name in tool_map:
                    result = tool_map[tool_name].invoke(tool_args)
                else:
                    result = f"Unknown tool: {tool_name}"

                # Track file modifications
                if tool_name == "write_file" and "path" in tool_args:
                    fpath = tool_args["path"]
                    if fpath not in files_modified:
                        files_modified.append(fpath)

                messages.append(ToolMessage(content=str(result), tool_call_id=tc["id"]))

        # Commit changes for this step
        git_tools = create_git_tools(repo_path)
        commit_tool = next(t for t in git_tools if t.name == "git_commit")
        commit_result = commit_tool.invoke({"message": f"step {step['step']}: {step['description']}"})

        # Auto-push to remote after each step
        push_tool = next((t for t in git_tools if t.name == "git_push"), None)
        push_result = ""
        if push_tool:
            try:
                push_result = push_tool.invoke({})
            except Exception:
                push_result = "push skipped"

        ws_events.append({
            "type": "git_commit",
            "timestamp": time.time(),
            "data": {"message": f"{commit_result} | {push_result}"},
        })

        # Mark step as done, advance
        plan[current_step] = {**step, "status": "done"}

        ws_events.append({
            "type": "step_completed",
            "timestamp": time.time(),
            "data": {"step": step["step"], "description": step["description"]},
        })

        next_step = current_step + 1
        new_status = "coding" if next_step < len(plan) else "testing"

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

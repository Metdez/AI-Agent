"""Fixer agent — analyzes test failures and produces a fix strategy."""

import time
import os
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from state import DeepDevState
from config import MODEL, TRUNCATE_TEST_RESULTS, TRUNCATE_FILE_CONTENT, TRUNCATE_THINKING

SYSTEM_PROMPT = """You are a senior debugging expert. Tests have failed and you need to analyze the error and produce a concrete fix strategy.

Given the test output and the relevant source files, you must:
1. Identify the root cause of the failure
2. Explain what needs to change and in which files
3. Provide a clear, actionable fix strategy that a coder agent can follow

Be specific — reference exact file paths, function names, and line numbers where possible. Your analysis will be passed to a coder agent to implement the fix."""


def fixer_node(state: DeepDevState) -> dict:
    """Analyze test failures and produce an error analysis with fix strategy."""
    try:
        repo_path = state["repo_path"]
        test_results = state.get("test_results", "")
        files_modified = state.get("files_modified", [])
        fix_attempts = state.get("fix_attempts", 0)
        ws_events = list(state.get("ws_events", []))

        ws_events.append({
            "type": "status_change",
            "timestamp": time.time(),
            "data": {
                "status": "fixing",
                "message": f"Analyzing failure (attempt {fix_attempts + 1}/3)...",
            },
        })

        # Read the relevant source files for context
        file_contents = {}
        for fpath in files_modified[:10]:  # Cap at 10 files
            full = os.path.join(repo_path, fpath)
            if os.path.isfile(full):
                try:
                    with open(full, "r", encoding="utf-8") as f:
                        content = f.read()
                    if len(content) < TRUNCATE_FILE_CONTENT:
                        file_contents[fpath] = content
                except Exception:
                    pass

        # Build context for the LLM
        parts = [f"Test output:\n```\n{test_results[:TRUNCATE_TEST_RESULTS]}\n```"]
        if file_contents:
            parts.append("Relevant source files:")
            for fpath, content in file_contents.items():
                parts.append(f"\n--- {fpath} ---\n```\n{content}\n```")
        parts.append(f"\nThis is fix attempt {fix_attempts + 1} of 3. Be thorough.")

        llm = ChatAnthropic(model=MODEL, temperature=0, max_tokens=4096)
        response = llm.invoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content="\n\n".join(parts)),
        ])

        error_analysis = response.content

        ws_events.append({
            "type": "thinking",
            "timestamp": time.time(),
            "data": {
                "agent": "fixer",
                "analysis": error_analysis[:TRUNCATE_THINKING],
            },
        })

        # Find the failing step (or reuse last step) and reset it for the coder
        plan = list(state.get("plan", []))
        current_step = state.get("current_step", 0)
        # Back up one step so the coder re-implements with the fix
        fix_step = max(0, current_step - 1)
        if fix_step < len(plan):
            plan[fix_step] = {
                **plan[fix_step],
                "status": "pending",
                "description": plan[fix_step]["description"] if plan[fix_step]["description"].startswith("[FIX]") else f"[FIX] {plan[fix_step]['description']}",
            }

        return {
            "error_analysis": error_analysis,
            "fix_attempts": fix_attempts + 1,
            "current_step": fix_step,
            "plan": plan,
            "status": "fixing",
            "messages": state.get("messages", []) + [response],
            "ws_events": ws_events,
        }

    except Exception as e:
        ws_events = list(state.get("ws_events", []))
        ws_events.append({
            "type": "error",
            "timestamp": time.time(),
            "data": {"message": f"Fixer failed: {e}"},
        })
        return {
            "status": "failed",
            "ws_events": ws_events,
        }

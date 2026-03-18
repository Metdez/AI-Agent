"""Planner agent — creates a step-by-step implementation plan from a task description."""

import json
import os
import pathlib
import time
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from state import DeepDevState, PlanStep
from config import MODEL, TRUNCATE_README

SYSTEM_PROMPT = """You are a senior software architect. Given a task and codebase context, create a detailed step-by-step implementation plan.

Your response MUST be valid JSON — an array of plan steps. Each step has:
- "step": integer step number starting at 1
- "description": what to do in this step
- "files": list of file paths (relative to repo root) to create or modify

Example:
[
  {"step": 1, "description": "Create the data models in models.py", "files": ["src/models.py"]},
  {"step": 2, "description": "Implement the API endpoints", "files": ["src/api.py", "src/routes.py"]}
]

Be thorough but practical. Group related changes into single steps. Typically 3-8 steps for most tasks. Return ONLY the JSON array, no markdown fencing or extra text."""


def planner_node(state: DeepDevState) -> dict:
    """Generate an implementation plan from the task and repo context."""
    try:
        repo_path = state["repo_path"]
        task = state["task"]

        # Gather repo context
        context_parts = [f"Task: {task}"]

        # List files in repo
        repo_dir = pathlib.Path(repo_path)
        if repo_dir.exists():
            files = []
            for p in repo_dir.rglob("*"):
                if p.is_file():
                    rel = p.relative_to(repo_dir)
                    parts = rel.parts
                    if any(part.startswith(".git") for part in parts):
                        continue
                    if any(part == "node_modules" or part == "__pycache__" for part in parts):
                        continue
                    files.append(str(rel).replace("\\", "/"))
            files.sort()
            if files:
                context_parts.append(f"Existing files:\n{chr(10).join(files[:200])}")
            else:
                context_parts.append("This is an empty repository — no existing files.")

        # Read README if it exists
        readme_path = os.path.join(repo_path, "README.md")
        if os.path.isfile(readme_path):
            try:
                with open(readme_path, "r", encoding="utf-8") as f:
                    readme = f.read()[:TRUNCATE_README]
                context_parts.append(f"README.md:\n{readme}")
            except Exception:
                pass

        llm = ChatAnthropic(model=MODEL, temperature=0, max_tokens=4096)
        response = llm.invoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content="\n\n".join(context_parts)),
        ])

        # Parse the plan from the LLM response
        raw = response.content.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3].strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()

        steps_data = json.loads(raw)
        plan: list[PlanStep] = []
        for s in steps_data:
            plan.append(PlanStep(
                step=s["step"],
                description=s["description"],
                files=s.get("files", []),
                status="pending",
            ))

        ws_events = [
            {
                "type": "plan_created",
                "timestamp": time.time(),
                "data": {
                    "steps": [dict(s) for s in plan],
                    "total_steps": len(plan),
                },
            },
            {
                "type": "status_change",
                "timestamp": time.time(),
                "data": {"status": "planning", "message": f"Plan created with {len(plan)} steps"},
            },
        ]

        return {
            "plan": plan,
            "current_step": 0,
            "status": "planning",
            "messages": state.get("messages", []) + [response],
            "ws_events": state.get("ws_events", []) + ws_events,
        }

    except Exception as e:
        error_event = {
            "type": "error",
            "timestamp": time.time(),
            "data": {"message": f"Planning failed: {e}"},
        }
        return {
            "plan": [],
            "status": "failed",
            "ws_events": state.get("ws_events", []) + [error_event],
        }

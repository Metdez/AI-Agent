"""FastAPI server for DeepDev — WebSocket-based multi-agent coding system."""

import asyncio
import json
import os
import pathlib
import sys

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# Load API keys from the project root .env
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

# Ensure the backend package root is on the path so local imports work
sys.path.insert(0, os.path.dirname(__file__))

from config import CORS_ORIGINS, ALLOWED_REPO_ROOTS, SERVER_HOST, SERVER_PORT
from graph import run_deepdev

app = FastAPI(title="DeepDev Backend", version="0.1.0")

# CORS — configurable via DEEPDEV_CORS_ORIGINS env var
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _validate_repo_path(repo_path: str) -> str | None:
    """Return an error message if repo_path is not allowed, else None."""
    resolved = pathlib.Path(repo_path).resolve()
    if not resolved.is_dir():
        return f"repo_path does not exist: {repo_path}"
    if ALLOWED_REPO_ROOTS:
        if not any(resolved.is_relative_to(pathlib.Path(r).resolve()) for r in ALLOWED_REPO_ROOTS):
            return f"repo_path not in allowed roots: {repo_path}"
    return None


@app.get("/")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "deepdev-backend",
        "version": "0.1.0",
    }


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """Main WebSocket communication channel.

    Protocol:
      Client sends:
        {"type": "start_task", "task": "...", "repo_path": "..."}
        {"type": "cancel"}

      Server sends streaming events:
        {"type": "branch_created", ...}
        {"type": "plan_created", ...}
        {"type": "status_change", ...}
        {"type": "step_started", ...}
        {"type": "step_completed", ...}
        {"type": "tool_call", ...}
        {"type": "git_commit", ...}
        {"type": "terminal_output", ...}
        {"type": "test_result", ...}
        {"type": "thinking", ...}
        {"type": "completed", ...}
        {"type": "error", ...}
    """
    await ws.accept()

    # Cancellation flag
    cancel_event = asyncio.Event()
    active_task: asyncio.Task | None = None

    def translate_event(event: dict) -> dict | None:
        """Translate backend ws_events to the frontend's expected flat format."""
        etype = event.get("type", "")
        data = event.get("data", {})

        if etype == "status_change":
            # Map status to agent name
            status = data.get("status", "")
            agent_map = {
                "planning": "planner",
                "coding": "coder",
                "testing": "tester",
                "fixing": "fixer",
                "starting": "supervisor",
                "done": "supervisor",
                "failed": "supervisor",
                "cancelled": "supervisor",
            }
            agent = agent_map.get(status, "supervisor")
            status_map = {
                "planning": "active",
                "coding": "active",
                "testing": "active",
                "fixing": "active",
                "starting": "active",
                "done": "complete",
                "failed": "error",
                "cancelled": "error",
            }
            return {"type": "status", "agent": agent, "status": status_map.get(status, "active")}

        if etype == "plan_created":
            steps = data.get("steps", [])
            return {"type": "plan", "steps": steps}

        if etype == "step_started":
            return {"type": "thinking", "agent": "coder", "content": f"Step {data.get('step')}: {data.get('description')}"}

        if etype == "step_completed":
            return {"type": "thinking", "agent": "coder", "content": f"Completed step {data.get('step')}: {data.get('description')}"}

        if etype == "tool_call":
            tool = data.get("tool", "")
            args = data.get("args", {})
            # If it's a write_file, send as code change
            if tool == "write_file":
                return {"type": "code", "file": args.get("path", ""), "content": args.get("content", ""), "action": "create"}
            # If it's a run_command, send as terminal
            if tool == "run_command":
                return {"type": "terminal", "output": f"$ {args.get('command', '')}", "stream": "stdout"}
            return {"type": "thinking", "agent": "coder", "content": f"Using tool: {tool}"}

        if etype == "git_commit":
            return {"type": "git", "action": "commit", "message": data.get("message", ""), "branch": ""}

        if etype == "branch_created":
            return {"type": "git", "action": "branch", "message": data.get("message", ""), "branch": data.get("branch", "")}

        if etype == "terminal_output":
            return {"type": "terminal", "output": data.get("output", ""), "stream": "stdout"}

        if etype == "test_result":
            passed = data.get("passed", False)
            output = data.get("output", data.get("message", ""))
            return {"type": "terminal", "output": f"{'PASS' if passed else 'FAIL'}: {output}", "stream": "stdout" if passed else "stderr"}

        if etype == "thinking":
            return {"type": "thinking", "agent": data.get("agent", "fixer"), "content": data.get("analysis", data.get("content", ""))}

        if etype == "completed":
            files = data.get("files_modified", [])
            branch = data.get("branch", "")
            return {"type": "complete", "summary": f"Completed! Modified {len(files)} files.", "branch": branch, "commits": len(files)}

        if etype == "error":
            return {"type": "error", "message": data.get("message", "Unknown error"), "recoverable": False}

        # Unknown event type — send as thinking
        return {"type": "thinking", "agent": "supervisor", "content": str(data)}

    async def send_event(event: dict):
        """Translate and send a single event over the WebSocket, respecting cancellation."""
        if cancel_event.is_set():
            raise asyncio.CancelledError("Task cancelled by user")
        try:
            translated = translate_event(event)
            if translated:
                await ws.send_json(translated)
        except asyncio.CancelledError:
            raise
        except Exception:
            pass  # Connection may have closed

    async def run_task(task: str, repo_path: str):
        """Execute the DeepDev pipeline, streaming events to the client."""
        try:
            await send_event({
                "type": "status_change",
                "data": {"status": "starting", "message": f"Starting task: {task}"},
            })
            await run_deepdev(task=task, repo_path=repo_path, event_callback=send_event)
        except asyncio.CancelledError:
            await send_event({
                "type": "status_change",
                "data": {"status": "cancelled", "message": "Task was cancelled"},
            })
        except Exception as e:
            await send_event({
                "type": "error",
                "data": {"message": f"Unexpected error: {e}"},
            })

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "Invalid JSON", "recoverable": True})
                continue

            msg_type = msg.get("type")

            if msg_type == "start_task":
                task = msg.get("task", "").strip()
                repo_path = msg.get("repo_path", "").strip()

                if not task:
                    await ws.send_json({
                        "type": "error",
                        "message": "Missing 'task' field",
                        "recoverable": True,
                    })
                    continue
                if not repo_path:
                    await ws.send_json({
                        "type": "error",
                        "message": "Missing 'repo_path' field",
                        "recoverable": True,
                    })
                    continue
                repo_error = _validate_repo_path(repo_path)
                if repo_error:
                    await ws.send_json({
                        "type": "error",
                        "message": repo_error,
                        "recoverable": True,
                    })
                    continue

                # Cancel any existing task
                if active_task and not active_task.done():
                    cancel_event.set()
                    active_task.cancel()
                    try:
                        await active_task
                    except (asyncio.CancelledError, Exception):
                        pass

                cancel_event.clear()
                active_task = asyncio.create_task(run_task(task, repo_path))

            elif msg_type == "cancel":
                if active_task and not active_task.done():
                    cancel_event.set()
                    active_task.cancel()
                    await ws.send_json({
                        "type": "status", "agent": "supervisor", "status": "error",
                    })

            else:
                await ws.send_json({
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}",
                    "recoverable": True,
                })

    except WebSocketDisconnect:
        if active_task and not active_task.done():
            cancel_event.set()
            active_task.cancel()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=SERVER_HOST, port=SERVER_PORT)

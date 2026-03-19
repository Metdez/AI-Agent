"""Main LangGraph graph for DeepDev — assembles nodes and edges."""

import re
import time
import asyncio
import logging
from typing import Callable, Awaitable
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from state import DeepDevState
from agents.planner import planner_node
from agents.tester import tester_node
from agents.fixer import fixer_node
from scheduler import scheduler_node
from wave_executor import wave_prepare_node, coder_worker_node, wave_collect_node
from merge_coordinator import merge_coordinator_node, cleanup_stale_worktrees
from agents.supervisor import (
    route_next, schedule_wave,
    NODE_TESTER, NODE_FIXER, NODE_DONE, NODE_FAILED,
    NODE_STEP_SCHEDULER, NODE_MERGE_COORDINATOR,
)
from tools.git_ops import create_git_tools
from persistence import load_state, delete_state
from live_events import set_live_callback

log = logging.getLogger("deepdev.graph")


def _push_branch(repo_path: str) -> str:
    """Push the current branch to origin."""
    try:
        git_tools = create_git_tools(repo_path)
        push_tool = next(t for t in git_tools if t.name == "git_push")
        return push_tool.invoke({})
    except Exception as e:
        return f"Push failed: {e}"


def _done_node(state: DeepDevState) -> dict:
    """Terminal node — marks the task as successfully completed and pushes to remote."""
    # Clean up saved state — task is done, nothing to resume
    delete_state(state.get("repo_path", ""))
    ws_events = list(state.get("ws_events", []))

    # Auto-push the branch to GitHub
    repo_path = state.get("repo_path", "")
    branch_name = state.get("branch_name", "")
    if repo_path and branch_name:
        push_result = _push_branch(repo_path)
        ws_events.append({
            "type": "git_commit",
            "timestamp": time.time(),
            "data": {"message": f"Auto-pushed: {push_result}"},
        })

    ws_events.append({
        "type": "status_change",
        "timestamp": time.time(),
        "data": {"status": "done", "message": "Task completed successfully"},
    })
    ws_events.append({
        "type": "completed",
        "timestamp": time.time(),
        "data": {
            "files_modified": state.get("files_modified", []),
            "branch": state.get("branch_name", ""),
        },
    })
    return {"status": "done", "ws_events": ws_events}


def _failed_node(state: DeepDevState) -> dict:
    """Terminal node — marks the task as failed."""
    ws_events = list(state.get("ws_events", []))
    ws_events.append({
        "type": "status_change",
        "timestamp": time.time(),
        "data": {"status": "failed", "message": "Task failed after maximum attempts"},
    })
    return {"status": "failed", "ws_events": ws_events}


def build_graph() -> StateGraph:
    """Build and compile the DeepDev state graph."""

    graph = StateGraph(DeepDevState)

    # Nodes
    graph.add_node("planner", planner_node)
    graph.add_node("step_scheduler", scheduler_node)
    graph.add_node("wave_prepare", wave_prepare_node)
    graph.add_node("coder_worker", coder_worker_node)
    graph.add_node("wave_collect", wave_collect_node)
    graph.add_node("merge_coordinator", merge_coordinator_node)
    graph.add_node("tester", tester_node)
    graph.add_node("fixer", fixer_node)
    graph.add_node("done", _done_node)
    graph.add_node("failed", _failed_node)

    # Entry point
    graph.set_entry_point("planner")

    # Planner -> step_scheduler (or failed)
    graph.add_conditional_edges("planner", route_next, {
        NODE_STEP_SCHEDULER: "step_scheduler",
        NODE_FAILED: "failed",
    })

    # step_scheduler -> wave_prepare (always)
    graph.add_edge("step_scheduler", "wave_prepare")

    # wave_prepare -> fan-out via Send to coder_worker nodes
    # schedule_wave returns list[Send] targeting "coder_worker"
    graph.add_conditional_edges("wave_prepare", schedule_wave)

    # After all Send workers complete, LangGraph merges results via
    # the wave_results reducer -> route to wave_collect
    graph.add_edge("coder_worker", "wave_collect")

    # wave_collect -> merge_coordinator
    graph.add_conditional_edges("wave_collect", route_next, {
        NODE_MERGE_COORDINATOR: "merge_coordinator",
        NODE_FAILED: "failed",
    })

    # merge_coordinator -> next wave or tester
    graph.add_conditional_edges("merge_coordinator", route_next, {
        NODE_STEP_SCHEDULER: "step_scheduler",
        NODE_TESTER: "tester",
        NODE_FAILED: "failed",
    })

    # Tester routing
    graph.add_conditional_edges("tester", route_next, {
        NODE_DONE: "done",
        NODE_FIXER: "fixer",
        NODE_FAILED: "failed",
        NODE_STEP_SCHEDULER: "step_scheduler",
    })

    # Fixer -> step_scheduler (re-schedule) or done (patch worked)
    graph.add_conditional_edges("fixer", route_next, {
        NODE_STEP_SCHEDULER: "step_scheduler",
        NODE_FAILED: "failed",
        NODE_DONE: "done",
    })

    # Terminal nodes
    graph.add_edge("done", END)
    graph.add_edge("failed", END)

    return graph


def compile_graph():
    """Compile the graph with a memory checkpointer."""
    graph = build_graph()
    checkpointer = MemorySaver()
    return graph.compile(checkpointer=checkpointer)


def _slugify(text: str) -> str:
    """Convert a task description into a branch-safe slug."""
    slug = text.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s]+", "-", slug)
    slug = slug[:40].strip("-")
    # Add a short timestamp for uniqueness
    ts = str(int(time.time()))[-5:]
    return f"deepdev/{slug}-{ts}"


async def run_deepdev(
    task: str,
    repo_path: str,
    event_callback: Callable[[dict], Awaitable[None]],
    force_fresh: bool = False,
) -> None:
    """Run the DeepDev pipeline end-to-end.

    Args:
        task: Natural language description of what to build.
        repo_path: Absolute path to the target git repository.
        event_callback: Async function called with each ws_event dict.
    """
    if force_fresh:
        delete_state(repo_path)

    # Check for saved state to reuse branch name
    saved = load_state(repo_path) if not force_fresh else None
    if saved and saved.get("task") == task and saved.get("branch_name"):
        branch_name = saved["branch_name"]
    else:
        branch_name = _slugify(task)

    # Create the branch
    git_tools = create_git_tools(repo_path)
    branch_tool = next(t for t in git_tools if t.name == "git_create_branch")
    branch_result = branch_tool.invoke({"branch_name": branch_name})

    try:
        cleanup_stale_worktrees(repo_path)
    except Exception as e:
        log.warning(f"Stale worktree cleanup failed: {e}")

    await event_callback({
        "type": "branch_created",
        "timestamp": time.time(),
        "data": {"branch": branch_name, "message": branch_result},
    })

    # Send immediate planning status so frontend shows activity right away
    await event_callback({
        "type": "status_change",
        "timestamp": time.time(),
        "data": {"status": "planning", "message": "Starting planner agent..."},
    })
    await event_callback({
        "type": "thinking",
        "timestamp": time.time(),
        "data": {"agent": "planner", "content": f"Analyzing task: {task}"},
    })

    # Build initial state
    initial_state: DeepDevState = {
        "task": task,
        "repo_path": repo_path,
        "branch_name": branch_name,
        "plan": [],
        "current_step": 0,
        "files_modified": [],
        "test_results": "",
        "test_passed": False,
        "error_analysis": "",
        "fix_attempts": 0,
        "messages": [],
        "status": "planning",
        "ws_events": [],
        # Parallel execution fields
        "dependencies": {},
        "waves": [],
        "current_wave": 0,
        "wave_results": {},
        "worktree_paths": {},
        "speculative_test": False,
        # Worker fields (empty at top level)
        "worker_id": "",
        "worktree_path": "",
    }

    # Enable real-time event streaming from within nodes
    set_live_callback(event_callback)

    compiled = compile_graph()
    config = {"configurable": {"thread_id": f"deepdev-{int(time.time())}"}}

    # Heartbeat: send "still working" pulses every 5 seconds while a node is processing
    heartbeat_active = True
    current_phase = "planning"

    async def heartbeat():
        """Send periodic pulse events so the frontend knows we're alive."""
        phase_messages = {
            "planning": [
                "Scanning repository structure...",
                "Reading project files...",
                "Generating implementation plan with Claude...",
                "Still generating plan — analyzing codebase...",
                "Almost done planning...",
            ],
            "coding": [
                "Writing code...",
                "Implementing changes...",
                "Still coding — executing tool calls...",
                "Working through implementation...",
            ],
            "testing": [
                "Running tests...",
                "Checking implementation...",
                "Analyzing test results...",
            ],
            "fixing": [
                "Analyzing failures...",
                "Determining fix strategy...",
                "Preparing corrections...",
            ],
            "scheduling": [
                "Scheduling parallel waves...",
                "Analyzing step dependencies...",
            ],
            "wave_merged": [
                "Merging parallel results...",
                "Integrating worktree changes...",
            ],
        }
        pulse_count = 0
        while heartbeat_active:
            await asyncio.sleep(5)
            if not heartbeat_active:
                break
            messages = phase_messages.get(current_phase, ["Working..."])
            msg = messages[min(pulse_count, len(messages) - 1)]
            agent_map = {
                "planning": "planner",
                "coding": "coder",
                "testing": "tester",
                "fixing": "fixer",
                "scheduling": "supervisor",
            }
            await event_callback({
                "type": "thinking",
                "timestamp": time.time(),
                "data": {"agent": agent_map.get(current_phase, "supervisor"),
                         "content": msg},
            })
            pulse_count += 1

    heartbeat_task = asyncio.create_task(heartbeat())

    # Track which events we've already sent
    events_sent = 0

    try:
        # Stream through the graph node by node
        async for event in compiled.astream(initial_state, config=config):
            # event is a dict of {node_name: partial_state_update}
            for node_name, node_output in event.items():
                # Update current phase based on node name
                phase_map = {
                    "planner": "coding",
                    "step_scheduler": "scheduling",
                    "wave_prepare": "coding",
                    "coder_worker": "coding",
                    "wave_collect": "coding",
                    "merge_coordinator": "coding",
                    "tester": "testing",
                    "fixer": "fixing",
                }
                if node_name in phase_map:
                    node_status = node_output.get("status", "")
                    # Use the actual status if it's a real running phase,
                    # otherwise use the phase_map (what comes next).
                    # This fixes the planner returning "planning" which kept
                    # the heartbeat stuck on "Almost done planning..."
                    if node_status in ("coding", "testing", "fixing"):
                        current_phase = node_status
                    else:
                        current_phase = phase_map[node_name]

                if node_output and "ws_events" in node_output:
                    all_events = node_output["ws_events"]
                    new_events = all_events[events_sent:]
                    for ws_event in new_events:
                        await event_callback(ws_event)
                    events_sent = len(all_events)
    finally:
        heartbeat_active = False
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass

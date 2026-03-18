"""Main LangGraph graph for DeepDev — assembles nodes and edges."""

import re
import time
import asyncio
from typing import Callable, Awaitable
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from state import DeepDevState
from agents.planner import planner_node
from agents.coder import coder_node
from agents.tester import tester_node
from agents.fixer import fixer_node
from agents.supervisor import route_next, NODE_CODER, NODE_TESTER, NODE_FIXER, NODE_DONE, NODE_FAILED
from tools.git_ops import create_git_tools


def _done_node(state: DeepDevState) -> dict:
    """Terminal node — marks the task as successfully completed."""
    ws_events = list(state.get("ws_events", []))
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

    # Add nodes
    graph.add_node("planner", planner_node)
    graph.add_node("coder", coder_node)
    graph.add_node("tester", tester_node)
    graph.add_node("fixer", fixer_node)
    graph.add_node("done", _done_node)
    graph.add_node("failed", _failed_node)

    # Entry point
    graph.set_entry_point("planner")

    # Planner always goes to supervisor routing
    graph.add_conditional_edges("planner", route_next, {
        NODE_CODER: "coder",
        NODE_FAILED: "failed",
    })

    # Coder goes to supervisor routing (may loop back to coder or go to tester)
    graph.add_conditional_edges("coder", route_next, {
        NODE_CODER: "coder",
        NODE_TESTER: "tester",
        NODE_FAILED: "failed",
    })

    # Tester goes to supervisor routing
    graph.add_conditional_edges("tester", route_next, {
        NODE_DONE: "done",
        NODE_FIXER: "fixer",
        NODE_FAILED: "failed",
    })

    # Fixer always routes to coder
    graph.add_conditional_edges("fixer", route_next, {
        NODE_CODER: "coder",
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
) -> None:
    """Run the DeepDev pipeline end-to-end.

    Args:
        task: Natural language description of what to build.
        repo_path: Absolute path to the target git repository.
        event_callback: Async function called with each ws_event dict.
    """
    branch_name = _slugify(task)

    # Create the branch
    git_tools = create_git_tools(repo_path)
    branch_tool = next(t for t in git_tools if t.name == "git_create_branch")
    branch_result = branch_tool.invoke({"branch_name": branch_name})

    await event_callback({
        "type": "branch_created",
        "timestamp": time.time(),
        "data": {"branch": branch_name, "message": branch_result},
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
    }

    compiled = compile_graph()
    config = {"configurable": {"thread_id": f"deepdev-{int(time.time())}"}}

    # Track which events we've already sent
    events_sent = 0

    # Stream through the graph node by node
    async for event in compiled.astream(initial_state, config=config):
        # event is a dict of {node_name: partial_state_update}
        for node_name, node_output in event.items():
            if node_output and "ws_events" in node_output:
                all_events = node_output["ws_events"]
                new_events = all_events[events_sent:]
                for ws_event in new_events:
                    await event_callback(ws_event)
                events_sent = len(all_events)

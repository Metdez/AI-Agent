"""Real-time event streaming from within LangGraph nodes.

Nodes run synchronously inside LangGraph in a thread pool — they have no
access to the main async event loop.  This module captures the loop reference
when set_live_callback is called (from async context) and uses
run_coroutine_threadsafe to push events from any thread.

Usage:
    from live_events import emit_live_event, set_live_callback

    # In run_deepdev (graph.py) — before graph execution (async context):
    set_live_callback(event_callback)

    # In any node (coder.py, etc.) — works from sync thread pool code:
    emit_live_event({"type": "tool_call", "timestamp": ..., "data": {...}})
"""

import asyncio
from typing import Callable, Awaitable

_live_event_callback: Callable[[dict], Awaitable[None]] | None = None
_event_loop: asyncio.AbstractEventLoop | None = None


def set_live_callback(cb: Callable[[dict], Awaitable[None]] | None) -> None:
    """Set (or clear) the real-time event callback.

    Must be called from async context so we can capture the event loop.
    """
    global _live_event_callback, _event_loop
    _live_event_callback = cb
    if cb is not None:
        try:
            _event_loop = asyncio.get_running_loop()
        except RuntimeError:
            _event_loop = None
    else:
        _event_loop = None


def emit_live_event(event: dict) -> None:
    """Send an event to the frontend immediately.

    Safe to call from sync code running in a thread pool — uses
    run_coroutine_threadsafe to schedule on the captured event loop.
    """
    cb = _live_event_callback
    loop = _event_loop
    if cb is None or loop is None or loop.is_closed():
        return
    try:
        asyncio.run_coroutine_threadsafe(cb(event), loop)
    except RuntimeError:
        pass  # Loop closed or shutting down


def emit_live_event_with_worker(event: dict, worker_id: str | None) -> None:
    """Emit a live event with optional worker_id tagging."""
    if worker_id:
        event = {**event}
        event.setdefault("data", {})["worker_id"] = worker_id
    emit_live_event(event)

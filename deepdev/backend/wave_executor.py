"""Wave executor — worktree management and coder worker wrapper.

Three LangGraph nodes:
1. wave_prepare_node  — creates git worktrees before Send fan-out
2. coder_worker_node  — wraps coder_node, writes output to wave_results
3. wave_collect_node  — reads merged wave_results, transitions to merge
"""

import logging
import time
from state import DeepDevState, WaveResult
from merge_coordinator import create_worktree, cleanup_stale_worktrees
from scheduler import should_parallelize_wave
from agents.coder import coder_node

log = logging.getLogger("deepdev.wave_executor")


def wave_prepare_node(state: DeepDevState) -> dict:
    """Create worktrees for the current wave before Send fan-out.

    Single-step waves skip worktree creation (run on main branch).
    """
    waves = state.get("waves", [])
    current_wave = state.get("current_wave", 0)
    plan = state.get("plan", [])
    repo_path = state["repo_path"]
    branch_name = state.get("branch_name", "")
    ws_events = list(state.get("ws_events", []))

    if not waves or current_wave >= len(waves):
        log.warning("wave_prepare_node: no waves to process")
        return {"status": "wave_coding_complete", "ws_events": ws_events}

    wave_steps = waves[current_wave]
    parallelize = should_parallelize_wave(wave_steps, plan)
    worktree_paths: dict[int, str] = {}

    if parallelize and len(wave_steps) > 1:
        cleanup_stale_worktrees(repo_path)
        for step_idx in wave_steps:
            try:
                wt_path = create_worktree(repo_path, step_idx, branch_name)
                worktree_paths[step_idx] = wt_path
                log.info(f"Created worktree for step {step_idx}: {wt_path}")
            except RuntimeError as e:
                log.error(f"Worktree creation failed for step {step_idx}: {e}")

    return {
        "worktree_paths": worktree_paths,
        "status": "scheduling",
        "ws_events": ws_events,
    }


def coder_worker_node(state: DeepDevState) -> dict:
    """Wrapper around coder_node for parallel Send execution.

    Calls coder_node, then translates its output into a wave_results entry
    instead of writing to shared state fields (plan, files_modified, etc.).
    This prevents parallel workers from overwriting each other's state.
    """
    worker_id = state.get("worker_id", "")
    current_step = state.get("current_step", 0)

    log.info(f"coder_worker_node starting: worker_id={worker_id}, step={current_step}")

    # Call the actual coder node
    try:
        result = coder_node(state)
    except Exception as e:
        log.exception(f"coder_worker_node failed: {e}")
        result = {
            "files_modified": [],
            "status": "failed",
            "ws_events": list(state.get("ws_events", [])),
        }

    # Translate coder output into a wave_results entry
    success = result.get("status") != "failed"
    wave_result: WaveResult = {
        "step_index": current_step,
        "files_modified": result.get("files_modified", []),
        "worktree_path": state.get("worktree_path", ""),
        "success": success,
        "error": "" if success else result.get("error_analysis", "coder failed"),
    }

    # Return ONLY wave_results (via the merge reducer) and ws_events.
    # Do NOT return plan, current_step, files_modified, status, messages —
    # those would corrupt shared state when multiple workers merge.
    return {
        "wave_results": {current_step: wave_result},
        "ws_events": result.get("ws_events", []),
    }


def wave_collect_node(state: DeepDevState) -> dict:
    """Read merged wave_results after all parallel workers complete.

    Transitions to merge_coordinator.
    """
    wave_results = state.get("wave_results", {})
    ws_events = list(state.get("ws_events", []))
    current_wave = state.get("current_wave", 0)

    successes = sum(1 for wr in wave_results.values() if wr.get("success"))
    failures = sum(1 for wr in wave_results.values() if not wr.get("success"))

    log.info(
        f"Wave {current_wave}: {successes} succeeded, {failures} failed "
        f"out of {len(wave_results)} workers"
    )

    return {
        "status": "wave_coding_complete",
        "ws_events": ws_events,
    }

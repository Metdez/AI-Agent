"""Supervisor — conditional routing logic for the DeepDev graph."""

import logging
from langgraph.types import Send
from state import DeepDevState
from config import MAX_FIX_ATTEMPTS, SPECULATIVE_TEST

log = logging.getLogger("deepdev.supervisor")

# Sentinel node names used by the graph
NODE_PLANNER = "planner"
NODE_CODER = "coder"
NODE_TESTER = "tester"
NODE_FIXER = "fixer"
NODE_DONE = "done"
NODE_FAILED = "failed"
NODE_STEP_SCHEDULER = "step_scheduler"
NODE_MERGE_COORDINATOR = "merge_coordinator"
NODE_SPECULATIVE_TESTER = "speculative_tester"
NODE_CODER_WORKER = "coder_worker"


def route_next(state: DeepDevState) -> str:
    """Determine the next node based on current state.

    Routing logic:
      planning  + plan exists        -> step_scheduler
      scheduling                     -> (handled by schedule_wave returning Send objects)
      wave_coding_complete           -> merge_coordinator
      wave_merged + speculative_test -> speculative_tester
      wave_merged + last wave        -> tester
      wave_merged + more waves       -> step_scheduler
      coding    + all steps done     -> tester
      coding    + steps remaining    -> coder  (loop back for next step)
      testing   + tests passed + more waves -> step_scheduler
      testing   + tests passed + no more    -> done
      testing   + tests failed < 3x  -> fixer
      testing   + fix_attempts >= 3  -> failed
      fixing    (always)             -> step_scheduler  (re-schedule failed steps)
      failed / done                  -> END
    """
    status = state.get("status", "")
    plan = state.get("plan", [])
    test_passed = state.get("test_passed", False)
    fix_attempts = state.get("fix_attempts", 0)
    waves = state.get("waves", [])
    current_wave = state.get("current_wave", 0)

    if status == "planning":
        if plan:
            return NODE_STEP_SCHEDULER
        return NODE_FAILED

    if status == "scheduling":
        # The schedule_wave function will be called to produce Send objects
        return NODE_STEP_SCHEDULER

    if status == "wave_coding_complete":
        return NODE_MERGE_COORDINATOR

    if status == "wave_merged":
        has_more_waves = waves and current_wave < len(waves)
        if SPECULATIVE_TEST:
            return NODE_SPECULATIVE_TESTER
        if has_more_waves:
            return NODE_STEP_SCHEDULER
        return NODE_TESTER

    if status == "testing":
        if test_passed:
            has_more_waves = waves and current_wave < len(waves)
            if has_more_waves:
                return NODE_STEP_SCHEDULER
            return NODE_DONE
        if fix_attempts >= MAX_FIX_ATTEMPTS:
            return NODE_FAILED
        return NODE_FIXER

    if status == "fixing":
        return NODE_STEP_SCHEDULER

    # Default: if status is done/failed or unknown, end
    return NODE_DONE if status == "done" else NODE_FAILED


def schedule_wave(state: DeepDevState) -> list[Send]:
    """Create Send objects for parallel coder workers in the current wave.

    Each Send targets the "coder_worker" node with a per-step state slice
    including all DeepDevState fields, a worker_id, and a worktree_path.
    """
    waves = state.get("waves", [])
    current_wave = state.get("current_wave", 0)
    plan = state.get("plan", [])
    worktree_paths = state.get("worktree_paths", {})

    if not waves or current_wave >= len(waves):
        log.warning("schedule_wave called with no waves remaining")
        return []

    wave_steps = waves[current_wave]
    sends = []

    for step_index in wave_steps:
        # Find the plan step (step numbers are 1-indexed, list is 0-indexed)
        plan_idx = step_index - 1 if step_index > 0 else step_index
        if plan_idx < 0 or plan_idx >= len(plan):
            log.warning(f"schedule_wave: step index {step_index} out of range, skipping")
            continue

        worker_id = f"coder-step-{step_index}"
        worktree_path = worktree_paths.get(step_index, worktree_paths.get(str(step_index)))

        # Build a per-worker state slice with all DeepDevState fields
        worker_state = {
            "task": state.get("task", ""),
            "repo_path": state["repo_path"],
            "branch_name": state.get("branch_name", ""),
            "plan": plan,
            "current_step": plan_idx,
            "files_modified": list(state.get("files_modified", [])),
            "test_results": "",
            "test_passed": False,
            "error_analysis": state.get("error_analysis", ""),
            "fix_attempts": state.get("fix_attempts", 0),
            "messages": [],
            "status": "coding",
            "ws_events": [],
            # Parallel execution fields
            "dependencies": state.get("dependencies", {}),
            "waves": state.get("waves", []),
            "current_wave": state.get("current_wave", 0),
            "wave_results": {},
            "worktree_paths": state.get("worktree_paths", {}),
            "speculative_test": state.get("speculative_test", False),
            # Worker-specific fields
            "worker_id": worker_id,
            "worktree_path": worktree_path or "",
        }

        sends.append(Send(NODE_CODER_WORKER, worker_state))

    log.info(f"schedule_wave: dispatching wave {current_wave} with {len(sends)} parallel coder(s): steps {wave_steps}")

    return sends

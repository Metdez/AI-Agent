"""Supervisor — conditional routing logic for the DeepDev graph."""

from state import DeepDevState
from config import MAX_FIX_ATTEMPTS

# Sentinel node names used by the graph
NODE_PLANNER = "planner"
NODE_CODER = "coder"
NODE_TESTER = "tester"
NODE_FIXER = "fixer"
NODE_DONE = "done"
NODE_FAILED = "failed"


def route_next(state: DeepDevState) -> str:
    """Determine the next node based on current state.

    Routing logic:
      planning  + plan exists        -> coder
      coding    + all steps done     -> tester
      coding    + steps remaining    -> coder  (loop back for next step)
      testing   + tests passed       -> done
      testing   + tests failed < 3x  -> fixer
      testing   + fix_attempts >= 3  -> failed
      fixing    (always)             -> coder  (apply the fix)
      failed / done                  -> END
    """
    status = state.get("status", "")
    plan = state.get("plan", [])
    current_step = state.get("current_step", 0)
    test_passed = state.get("test_passed", False)
    fix_attempts = state.get("fix_attempts", 0)

    if status == "planning":
        if plan:
            return NODE_CODER
        return NODE_FAILED

    if status == "coding":
        if current_step >= len(plan):
            return NODE_TESTER
        # More steps to implement
        return NODE_CODER

    if status == "testing":
        if test_passed:
            return NODE_DONE
        if fix_attempts >= MAX_FIX_ATTEMPTS:
            return NODE_FAILED
        return NODE_FIXER

    if status == "fixing":
        return NODE_CODER

    # Default: if status is done/failed or unknown, end
    return NODE_DONE if status == "done" else NODE_FAILED

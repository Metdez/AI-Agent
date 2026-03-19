from typing import TypedDict, Annotated
from langgraph.graph import add_messages


def merge_wave_results(left: dict, right: dict) -> dict:
    """Reducer that merges wave_results dicts from parallel Send outputs."""
    merged = {**left}
    merged.update(right)
    return merged


class PlanStep(TypedDict):
    step: int
    description: str
    files: list[str]       # files to create/modify
    status: str            # pending | active | done | failed
    reads: list[str]       # files this step reads
    writes: list[str]      # files this step writes


class WaveResult(TypedDict):
    step_index: int
    files_modified: list[str]
    worktree_path: str
    success: bool
    error: str             # empty string if success


class DeepDevState(TypedDict):
    # --- existing fields ---
    task: str
    repo_path: str
    branch_name: str
    plan: list[PlanStep]
    current_step: int
    files_modified: list[str]
    test_results: str
    test_passed: bool
    error_analysis: str
    fix_attempts: int
    messages: Annotated[list, add_messages]
    # Status values: planning | scheduling | wave_coding_complete |
    #   wave_merged | coding | testing | fixing | done | failed
    status: str
    ws_events: list[dict]  # events to stream to frontend

    # --- new fields for parallel execution ---
    dependencies: dict[str, list[int]]            # step -> list of step indices it depends on
    waves: list[list[int]]                        # [[1,3,4], [2], [5]] -- step groups
    current_wave: int                             # index into waves
    wave_results: Annotated[dict, merge_wave_results]  # per-step results from parallel execution
    worktree_paths: dict[int, str]                # step -> worktree path mapping
    speculative_test: bool                        # config flag

    # --- worker fields (populated only during Send fan-out) ---
    worker_id: str                                # e.g. "coder-step-3", empty when not a worker
    worktree_path: str                            # worktree path for this worker, empty when not a worker

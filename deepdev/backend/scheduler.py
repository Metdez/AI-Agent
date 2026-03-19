"""StepScheduler — groups plan steps into parallel waves based on file dependencies.

Pure deterministic logic, no LLM calls.  Steps that share no files can execute
in the same wave; steps that depend on each other are placed in later waves.
"""

import time
from collections import defaultdict

from state import DeepDevState, PlanStep


# ---------------------------------------------------------------------------
# 1. Dependency graph
# ---------------------------------------------------------------------------

def build_dependency_graph(plan: list[PlanStep]) -> dict[int, list[int]]:
    """Return a map of step_index -> [indices this step depends on].

    Step B depends on Step A when A *writes* a file that B reads or writes.
    Transitive dependencies are included: if C depends on B and B depends on A,
    then C's list will contain both A and B.
    """
    # Index: which steps write to each file
    file_writers: dict[str, list[int]] = defaultdict(list)
    for idx, step in enumerate(plan):
        for f in step.get("writes", []):
            file_writers[f].append(idx)

    # Direct dependencies
    direct: dict[int, set[int]] = {i: set() for i in range(len(plan))}
    for idx, step in enumerate(plan):
        touched = set(step.get("reads", [])) | set(step.get("writes", []))
        for f in touched:
            for writer_idx in file_writers[f]:
                if writer_idx != idx:
                    direct[idx].add(writer_idx)

    # Close over transitive dependencies (simple BFS per step)
    full: dict[int, list[int]] = {}
    for idx in range(len(plan)):
        visited: set[int] = set()
        queue = list(direct[idx])
        while queue:
            dep = queue.pop()
            if dep in visited:
                continue
            visited.add(dep)
            queue.extend(direct[dep])
        full[idx] = sorted(visited)

    return full


# ---------------------------------------------------------------------------
# 2. Wave grouping (topological sort into layers)
# ---------------------------------------------------------------------------

def group_into_waves(
    plan: list[PlanStep],
    dependencies: dict[int, list[int]],
) -> list[list[int]]:
    """Partition step indices into waves so no step in a wave depends on another
    step in the same (or later) wave.

    Returns a list of waves, earliest first.  Each wave is a sorted list of
    step indices.
    """
    remaining = set(range(len(plan)))
    scheduled: set[int] = set()
    waves: list[list[int]] = []

    while remaining:
        # A step is ready when all its dependencies have already been scheduled.
        wave = sorted(
            idx for idx in remaining
            if all(dep in scheduled for dep in dependencies.get(idx, []))
        )
        if not wave:
            # Cycle detected — shouldn't happen with well-formed plans.
            # Break the cycle by scheduling all remaining steps.
            wave = sorted(remaining)
        waves.append(wave)
        scheduled.update(wave)
        remaining -= set(wave)

    return waves


# ---------------------------------------------------------------------------
# 3. Parallelization heuristic
# ---------------------------------------------------------------------------

def should_parallelize_wave(wave: list[int], plan: list[PlanStep]) -> bool:
    """Decide whether a wave is worth running in parallel.

    Returns False for single-step waves or trivially small waves where the
    overhead of worktree setup would outweigh any benefit.
    """
    if len(wave) <= 1:
        return False

    total_files = sum(
        len(plan[idx].get("writes", [])) + len(plan[idx].get("reads", []))
        for idx in wave
    )
    # If the average files-per-step is < 2 the steps are likely trivial.
    if total_files < 2 * len(wave):
        return False

    return True


# ---------------------------------------------------------------------------
# 4. LangGraph node
# ---------------------------------------------------------------------------

def scheduler_node(state: DeepDevState) -> dict:
    """Compute dependency graph and wave schedule from the current plan.

    On first entry: computes waves from scratch, sets current_wave=0.
    On re-entry (waves already exist): preserves wave list and current_wave,
    only emits a wave_started event for the current wave.
    """
    plan: list[PlanStep] = state.get("plan", [])
    ws_events = list(state.get("ws_events", []))
    existing_waves = state.get("waves", [])
    current_wave = state.get("current_wave", 0)

    if existing_waves and current_wave > 0:
        # Re-entry: waves already computed, we're continuing to the next wave
        if current_wave < len(existing_waves):
            ws_events.append({
                "type": "wave_started",
                "timestamp": time.time(),
                "data": {
                    "wave_index": current_wave,
                    "total_waves": len(existing_waves),
                    "steps": existing_waves[current_wave],
                    "parallel": should_parallelize_wave(existing_waves[current_wave], plan),
                },
            })
        return {
            "status": "scheduling",
            "ws_events": ws_events,
        }

    # First entry: compute dependency graph and waves
    dependencies = state.get("dependencies") or {}
    if not dependencies:
        dependencies = build_dependency_graph(plan)

    waves = group_into_waves(plan, dependencies)

    ws_events.append({
        "type": "wave_started",
        "timestamp": time.time(),
        "data": {
            "wave_index": 0,
            "total_waves": len(waves),
            "steps": waves[0] if waves else [],
            "parallel": should_parallelize_wave(waves[0], plan) if waves else False,
        },
    })

    return {
        "dependencies": dependencies,
        "waves": waves,
        "current_wave": 0,
        "status": "scheduling",
        "ws_events": ws_events,
    }

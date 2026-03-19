# DeepDev Performance Optimization — Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire together all parallel-execution components (scheduler, wave executor, merge coordinator, upgraded agents, frontend) into a working system.

**Architecture:** The parallel agents have already created/modified individual components. This plan integrates them: fix bugs, create missing `wave_executor.py` and `coder_worker` node, rewire `graph.py`, update persistence/events/main.py, and verify end-to-end.

**Tech Stack:** Python 3.11+, LangGraph 0.4+, FastAPI, Next.js/React/Tailwind

**Spec:** `docs/superpowers/specs/2026-03-18-deepdev-performance-optimization-design.md`

---

### Task 1: Fix merge_coordinator.py import bug

**Files:**
- Modify: `deepdev/backend/merge_coordinator.py:14`

The file uses `from deepdev.backend.state import ...` but all other backend files use `from state import ...` (because `sys.path` is set in `main.py:25`).

- [ ] **Step 1: Fix the import**

Change line 14 from:
```python
from deepdev.backend.state import DeepDevState, WaveResult
```
to:
```python
from state import DeepDevState, WaveResult
```

- [ ] **Step 2: Verify import works**

Run: `cd deepdev/backend && python -c "from merge_coordinator import merge_coordinator_node; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add deepdev/backend/merge_coordinator.py
git commit -m "fix: correct import path in merge_coordinator.py"
```

---

### Task 2: Add worker_id and worktree_path to DeepDevState

**Files:**
- Modify: `deepdev/backend/state.py`

LangGraph's `Send` passes state to worker nodes. If the state contains fields not defined in the TypedDict, they may be silently dropped. `worker_id` and `worktree_path` must be in DeepDevState.

- [ ] **Step 1: Add optional worker fields to DeepDevState**

After the `speculative_test` field, add:

```python
    # --- worker fields (populated only during Send fan-out) ---
    worker_id: str                                # e.g. "coder-step-3", empty when not a worker
    worktree_path: str                            # worktree path for this worker, empty when not a worker
```

- [ ] **Step 2: Commit**

```bash
git add deepdev/backend/state.py
git commit -m "feat: add worker_id and worktree_path to DeepDevState"
```

---

### Task 3: Fix scheduler_node to handle re-entry

**Files:**
- Modify: `deepdev/backend/scheduler.py:118-152`

Currently `scheduler_node` always recalculates all waves and resets `current_wave` to 0. When re-entered after a wave completes (or after a fix), it must preserve existing wave progress.

- [ ] **Step 1: Add re-entry guard to scheduler_node**

Replace the `scheduler_node` function body with:

```python
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
```

- [ ] **Step 2: Remove duplicate wave_started event from wave_prepare_node**

The `wave_prepare_node` (created in Task 5) should NOT emit `wave_started` — that's now handled by `scheduler_node`. `wave_prepare_node` only creates worktrees.

- [ ] **Step 3: Commit**

```bash
git add deepdev/backend/scheduler.py
git commit -m "fix: scheduler_node handles re-entry without resetting wave progress"
```

---

### Task 4: Remove dead sequential routing from supervisor.py

**Files:**
- Modify: `deepdev/backend/agents/supervisor.py:69-73`

The old sequential `coder -> coder` loop is replaced by wave-based execution. Remove the stale `status == "coding"` branch from `route_next` to avoid confusion.

- [ ] **Step 1: Remove the coding status branch**

Delete or comment out lines 69-73:

```python
    # REMOVED: sequential coder loop replaced by wave-based execution
    # if status == "coding":
    #     if current_step >= len(plan):
    #         return NODE_TESTER
    #     return NODE_CODER
```

The coder worker node (Task 5) handles its own status — it should never set top-level status to `"coding"`.

- [ ] **Step 2: Commit**

```bash
git add deepdev/backend/agents/supervisor.py
git commit -m "fix: remove dead sequential coder routing from supervisor"
```

---

### Task 5: Create wave_executor.py with coder_worker node

**Files:**
- Create: `deepdev/backend/wave_executor.py`

This is the critical missing piece. It provides:
1. `wave_prepare_node` — creates worktrees before Send fan-out
2. `coder_worker_node` — wraps `coder_node`, translates output to `wave_results`
3. `wave_collect_node` — reads merged `wave_results`, transitions to merge

The `coder_worker_node` is key: it calls the existing `coder_node` but captures its output and writes it into `wave_results` instead of letting it pollute shared state fields like `plan`, `current_step`, `files_modified`.

- [ ] **Step 1: Create wave_executor.py**

```python
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
```

- [ ] **Step 2: Verify imports**

Run: `cd deepdev/backend && python -c "from wave_executor import wave_prepare_node, coder_worker_node, wave_collect_node; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add deepdev/backend/wave_executor.py
git commit -m "feat: add wave_executor with coder_worker wrapper node"
```

---

### Task 6: Update supervisor.py schedule_wave to target coder_worker

**Files:**
- Modify: `deepdev/backend/agents/supervisor.py:141`

Currently `schedule_wave` sends to `NODE_CODER = "coder"`. It should target `"coder_worker"` instead, since `coder_worker_node` is the proper parallel wrapper.

- [ ] **Step 1: Add NODE_CODER_WORKER constant**

After the existing node constants (line 19), add:

```python
NODE_CODER_WORKER = "coder_worker"
```

- [ ] **Step 2: Update Send target in schedule_wave**

Change line 141 from:
```python
sends.append(Send(NODE_CODER, worker_state))
```
to:
```python
sends.append(Send(NODE_CODER_WORKER, worker_state))
```

- [ ] **Step 3: Add all DeepDevState fields to worker_state**

The `worker_state` dict in `schedule_wave` must include all DeepDevState fields (LangGraph validates against the TypedDict). Update the `worker_state` construction:

```python
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
```

- [ ] **Step 4: Commit**

```bash
git add deepdev/backend/agents/supervisor.py
git commit -m "feat: schedule_wave targets coder_worker node with full state"
```

---

### Task 7: Rewire graph.py

**Files:**
- Modify: `deepdev/backend/graph.py`

- [ ] **Step 1: Update imports**

Replace line 15 (`from agents.supervisor import ...`) with:

```python
from scheduler import scheduler_node
from wave_executor import wave_prepare_node, coder_worker_node, wave_collect_node
from merge_coordinator import merge_coordinator_node, cleanup_stale_worktrees
from agents.supervisor import (
    route_next, schedule_wave,
    NODE_CODER, NODE_TESTER, NODE_FIXER, NODE_DONE, NODE_FAILED,
    NODE_STEP_SCHEDULER, NODE_MERGE_COORDINATOR,
)
```

Also add at top: `import logging` and `log = logging.getLogger("deepdev.graph")`

- [ ] **Step 2: Replace build_graph() node and edge definitions**

Replace lines 75-121 with:

```python
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
```

Note: the old `"coder"` node is gone. All coding goes through `"coder_worker"`.

- [ ] **Step 3: Update initial state in run_deepdev()**

Replace the `initial_state` dict (lines 189-204) with:

```python
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
```

Note: `force_fresh` is no longer in initial state. It's only used in `run_deepdev()` to control `delete_state()` and `load_state()` calls, which happen before the graph runs.

- [ ] **Step 4: Add stale worktree cleanup at startup**

After the branch creation (line 168), add:

```python
try:
    cleanup_stale_worktrees(repo_path)
except Exception as e:
    log.warning(f"Stale worktree cleanup failed: {e}")
```

- [ ] **Step 5: Update heartbeat phase messages**

Add to `phase_messages` dict:

```python
"scheduling": [
    "Scheduling parallel waves...",
    "Analyzing step dependencies...",
],
"wave_merged": [
    "Merging parallel results...",
    "Integrating worktree changes...",
],
```

Add `"scheduling": "supervisor"` to the `agent_map`.

- [ ] **Step 6: Update event streaming phase_map**

Replace the `phase_map` in the `astream` loop with:

```python
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
```

- [ ] **Step 7: Verify graph builds**

Run: `cd deepdev/backend && python -c "from graph import build_graph; g = build_graph(); print('Nodes:', list(g.nodes.keys()))"`
Expected: Nodes list includes `step_scheduler`, `wave_prepare`, `coder_worker`, `wave_collect`, `merge_coordinator`

- [ ] **Step 8: Commit**

```bash
git add deepdev/backend/graph.py
git commit -m "feat: rewire graph for parallel wave execution with coder_worker"
```

---

### Task 8: Update persistence.py

**Files:**
- Modify: `deepdev/backend/persistence.py:12-16`

- [ ] **Step 1: Add new fields to PERSIST_FIELDS**

```python
PERSIST_FIELDS = [
    "task", "repo_path", "branch_name", "plan", "current_step",
    "files_modified", "test_results", "test_passed", "error_analysis",
    "fix_attempts", "status",
    # Parallel execution fields (wave_results/worktree_paths are ephemeral)
    "dependencies", "waves", "current_wave",
]
```

Note: `wave_results` and `worktree_paths` are NOT persisted. On resume, stale worktrees are cleaned up and the current wave is re-scheduled from scratch.

- [ ] **Step 2: Commit**

```bash
git add deepdev/backend/persistence.py
git commit -m "feat: persist wave scheduling state for resume support"
```

---

### Task 9: Update live_events.py

**Files:**
- Modify: `deepdev/backend/live_events.py`

- [ ] **Step 1: Add worker_id helper**

After `emit_live_event`, add:

```python
def emit_live_event_with_worker(event: dict, worker_id: str | None) -> None:
    """Emit a live event with optional worker_id tagging."""
    if worker_id:
        event = {**event}
        event.setdefault("data", {})["worker_id"] = worker_id
    emit_live_event(event)
```

- [ ] **Step 2: Commit**

```bash
git add deepdev/backend/live_events.py
git commit -m "feat: add worker_id tagging to live events"
```

---

### Task 10: Update main.py event translation

**Files:**
- Modify: `deepdev/backend/main.py`

- [ ] **Step 1: Add wave event handlers to translate_event()**

Before the "Unknown event type" fallback (line 172), add:

```python
if etype == "wave_started":
    return {
        "type": "wave_started",
        "wave": data.get("wave_index", 0),
        "steps": data.get("steps", []),
        "parallel": data.get("parallel", False),
        "total_waves": data.get("total_waves", 1),
    }

if etype == "wave_completed":
    return {
        "type": "wave_completed",
        "wave": data.get("wave", event.get("wave", 0)),
        "merge_status": "success",
        "files_modified": data.get("files_modified", event.get("files_modified", [])),
    }

if etype == "wave_conflict":
    return {
        "type": "wave_completed",
        "wave": data.get("wave", event.get("wave", 0)),
        "merge_status": "conflict",
        "conflicting_steps": data.get("conflicting_steps", event.get("conflicting_steps", [])),
    }
```

- [ ] **Step 2: Propagate worker_id in send_event()**

In `send_event()`, after `translated = translate_event(event)` and before `await ws.send_json(translated)`, add:

```python
# Propagate worker_id if present
worker_id = event.get("data", {}).get("worker_id")
if worker_id and translated:
    translated["worker_id"] = worker_id
```

- [ ] **Step 3: Add new statuses to agent_map and status_map**

In `translate_event()`, add to the `agent_map` dict:
```python
"scheduling": "supervisor",
"wave_merged": "supervisor",
"wave_coding_complete": "supervisor",
```

Add to the `status_map` dict:
```python
"scheduling": "active",
"wave_merged": "active",
"wave_coding_complete": "active",
```

- [ ] **Step 4: Commit**

```bash
git add deepdev/backend/main.py
git commit -m "feat: translate wave events for frontend WebSocket protocol"
```

---

### Task 11: Add nest_asyncio dependency

**Files:**
- Modify: `deepdev/backend/requirements.txt` (or equivalent)

The coder's parallel tool execution uses `import nest_asyncio`.

- [ ] **Step 1: Check if requirements file exists and add dependency**

Run: `ls deepdev/backend/requirements.txt deepdev/requirements.txt 2>/dev/null`

Add `nest-asyncio>=1.5.0` to whichever requirements file exists.

- [ ] **Step 2: Commit**

```bash
git add deepdev/requirements.txt  # or backend/requirements.txt
git commit -m "feat: add nest-asyncio dependency for parallel tool execution"
```

---

### Task 12: Verify end-to-end

**Files:** None (verification only)

- [ ] **Step 1: Python import check**

Run: `cd deepdev/backend && python -c "from graph import compile_graph; g = compile_graph(); print('Graph compiled OK')"`
Expected: `Graph compiled OK`

- [ ] **Step 2: Check all backend imports**

Run: `cd deepdev/backend && python -c "import main; print('All imports OK')"`
Expected: `All imports OK`

- [ ] **Step 3: Check frontend builds**

Run: `cd deepdev/frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Final commit**

```bash
git add -A deepdev/
git commit -m "feat: complete parallel execution integration"
```

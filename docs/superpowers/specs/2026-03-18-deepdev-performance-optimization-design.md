# DeepDev Performance Optimization — Full Concurrency Design

## Problem

DeepDev's pipeline is fully sequential: Planner -> Coder (step by step) -> Tester -> Fixer loop. A typical 3-step task takes 3-7 minutes. The user wants 3-5x speedup through parallelism, smarter model usage, and architectural improvements, while also making the UI feel more responsive.

## Goals

1. **Wall-clock speedup of 3-5x** on multi-step tasks
2. **Perceived speed improvement** — UI shows parallel progress, feels snappier
3. **Maintain correctness** — parallel execution must not introduce merge conflicts or broken state

## Constraints

- Must work with the existing Claude API (no custom inference infrastructure)
- Must preserve the existing WebSocket protocol (additive changes only)
- Git worktrees require the target repo to be a git repository
- Speculative testing is opt-in (config flag) due to added complexity

---

## Design

### 1. Parallel Step Execution with Worktree Isolation

The Planner outputs a dependency graph alongside the plan. Each step declares which files it reads/writes. A `StepScheduler` groups steps into **waves** — steps within a wave have no file overlaps and run concurrently. Steps that depend on prior steps' outputs wait for their wave.

**Example:**
```
Plan: [Step 1: create models.py] [Step 2: create api.py (needs models.py)] [Step 3: create tests.py] [Step 4: add README]

Wave 1: Step 1, Step 3, Step 4  (no shared files)
Wave 2: Step 2                   (depends on Step 1's models.py)
```

**Planner output change:** The planner now returns:
```json
{
  "steps": [...],
  "dependencies": {"2": [1], "5": [3, 4]},
  "file_mapping": {"1": ["src/models.py"], "2": ["src/api.py", "src/models.py"]}
}
```

**Git worktree isolation:** Each concurrent Coder gets its own git worktree (`git worktree add`). This avoids file conflicts entirely — each agent works in a clean copy of the repo.

**Merge strategy after wave completion:**
1. Pick one worktree as base (most changes)
2. Cherry-pick or merge changes from other worktrees
3. If merge conflict occurs (shouldn't if dependency analysis is correct), fall back to sequential re-execution of conflicting steps
4. Clean up worktrees after merge

### 2. Tiered Model Strategy

Different agents get different models based on task complexity:

| Agent | Model | Rationale |
|-------|-------|-----------|
| Planner | Haiku (`claude-haiku-4-5-20251001`) | Repo scanning + JSON plan generation is structured work |
| Coder | Sonnet (`claude-sonnet-4-6`) | Needs full reasoning for implementation |
| Tester | Haiku (`claude-haiku-4-5-20251001`) | Test detection is pattern matching |
| Fixer (analysis) | Haiku (`claude-haiku-4-5-20251001`) | Error analysis from stack traces is mechanical |
| Fixer (patching) | Sonnet (`claude-sonnet-4-6`) | Writing fix code needs full capability |

**Configuration:**
```python
AGENT_MODELS = {
    "planner": os.getenv("DEEPDEV_PLANNER_MODEL", "claude-haiku-4-5-20251001"),
    "coder": os.getenv("DEEPDEV_CODER_MODEL", "claude-sonnet-4-6"),
    "tester": os.getenv("DEEPDEV_TESTER_MODEL", "claude-haiku-4-5-20251001"),
    "fixer_analysis": os.getenv("DEEPDEV_FIXER_ANALYSIS_MODEL", "claude-haiku-4-5-20251001"),
    "fixer_patch": os.getenv("DEEPDEV_FIXER_PATCH_MODEL", "claude-sonnet-4-6"),
}
```

Each model is overridable via environment variable.

**Expected impact:** Haiku calls return 2-5x faster than Sonnet. Planner, Tester, and Fixer analysis are all on the critical path.

### 3. Fixer Agent Overhaul

**Current flow (slow):**
```
Tests fail -> Fixer analyzes -> Coder re-implements entire step -> Test again
```

**New two-tier flow:**
```
Tests fail -> Fixer analyzes (Haiku) -> Fixer applies targeted patch (Sonnet) -> Test again
                                            |
                                            v (if patch fails)
                                        Coder re-implements step with error context -> Test again
```

**Changes:**
- Fixer gets its own ReAct loop with same tool access as Coder (read_file, write_file, run_command, git_commit)
- Two-phase: Haiku analyzes failure (which test, why, suspect lines), then Sonnet applies targeted patch (editing only broken lines)
- Scoped context: Fixer receives only failing test output + modified files from the failing step, not entire conversation history
- Fast-fail: If Fixer's patch doesn't pass on first try, immediately fall back to Coder re-implementation

**Fix attempt budget (3 total):**
1. Fixer targeted patch
2. Coder re-implementation with Fixer analysis
3. Coder re-implementation with both prior failure contexts
4. After 3: task fails

### 4. Parallel Tool Execution

When Claude returns multiple tool calls in one response, execute them concurrently:

```python
# Current (serial)
for tool_call in tool_calls:
    result = execute_tool(tool_call)

# New (parallel)
results = await asyncio.gather(*[execute_tool(tc) for tc in tool_calls])
```

**Safety guard:** If two tool calls target the same file (write-write conflict), fall back to serial for that pair. Read-read and read-write of different files are always safe to parallelize.

### 5. Speculative Testing

Instead of waiting for ALL waves to complete before testing, the Tester starts after each wave merge:

```
Wave 1 complete -> Tester runs on Wave 1 code
Wave 2 running simultaneously
  |
  v
Wave 1 tests pass -> Wave 2 continues
Wave 1 tests fail -> Fixer starts on Wave 1 while Wave 2 continues
Wave 2 complete -> Full test suite runs
```

**Guard rails:**
- Speculative tests run on the main worktree after wave merge
- If a speculative test triggers a fix that conflicts with an in-progress wave, the in-progress wave is cancelled and restarted with the fix applied
- Opt-in via `DEEPDEV_SPECULATIVE_TEST=true`

### 6. Streaming & Frontend Optimizations

**Backend:**
- **Event batching:** Accumulate events over 100ms windows, send as JSON array. Reduces WebSocket overhead with parallel agents.
- **Agent-tagged events:** Every event carries `worker_id` (e.g., `"coder-step-1"`) so frontend knows which parallel track it belongs to.
- **Heartbeat consolidation:** One heartbeat for the whole system instead of per-agent.

**Frontend:**
- **Parallel step visualization:** PlanView shows waves as grouped rows. Steps in same wave appear side-by-side with independent progress indicators.
- **Multi-track terminal:** Terminal output tabbed by worker_id, plus "All" tab for interleaved view.
- **Activity feed throttling:** Debounce UI updates to 200ms max.
- **Wave progress bar:** Shows "Wave 1/3: 2/3 steps complete" instead of linear "Step 2/5".

**New WebSocket event types:**
```json
{"type": "wave_started", "wave": 1, "steps": [1, 3, 4]}
{"type": "wave_completed", "wave": 1, "merge_status": "success"}
{"type": "speculative_test_started", "wave": 1}
```

### 7. Graph Architecture Changes

**Current LangGraph flow:**
```
planner -> coder -> coder -> ... -> tester -> fixer -> coder -> tester -> done/failed
```

**New nested flow:**
```
planner -> step_scheduler -> [wave_executor] -> merge_coordinator -> speculative_tester -> ... -> done/failed
                                    |
                          parallel subgraphs:
                          +-- coder (worktree 1)
                          +-- coder (worktree 2)
                          +-- coder (worktree 3)
```

**New nodes:**

| Node | Responsibility |
|------|---------------|
| `step_scheduler` | Reads plan + dependencies, groups into waves, creates execution order |
| `wave_executor` | Spawns parallel Coder subgraphs via `asyncio.gather` + git worktrees |
| `merge_coordinator` | Merges worktree results back to main branch, handles conflicts |
| `speculative_tester` | Runs tests after each wave merge (overlaps with next wave if enabled) |

**Updated supervisor routing:**
```python
def route_next(state):
    if state["status"] == "planning" and state["plan"]:
        return "step_scheduler"
    if state["status"] == "scheduling":
        return "wave_executor"
    if state["status"] == "wave_complete":
        return "merge_coordinator"
    if state["status"] == "merged":
        return "speculative_tester"
    if state["status"] == "testing" and state["test_passed"]:
        if state["waves_remaining"]:
            return "step_scheduler"  # next wave
        return "done"
    if state["status"] == "testing" and not state["test_passed"]:
        if state["fix_attempts"] < 3:
            return "fixer"
        return "failed"
    if state["status"] == "fixing":
        return "wave_executor"  # re-run failed steps
```

**State additions:**
```python
# New fields on DeepDevState
waves: list[list[int]]           # [[1,3,4], [2], [5]] -- step groups
current_wave: int                # index into waves
wave_results: dict[int, dict]    # per-step results from parallel execution
worktree_paths: dict[int, str]   # step -> worktree path mapping
speculative_test: bool           # config flag
```

---

## Expected Performance

| Scenario | Current | After Optimization |
|----------|---------|-------------------|
| 3-step task (no deps) | ~200s | ~60-80s (1 wave) |
| 5-step task (2 waves) | ~400s | ~120-160s |
| Fix needed (1 attempt) | +120s | +30-40s (Fixer patches directly) |
| Planner phase | 20-40s | 5-15s (Haiku) |

**Overall: 3-5x speedup on typical multi-step tasks.**

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Git merge conflicts | Dependency analysis prevents shared-file parallelism; conflict = sequential fallback |
| Worktree cleanup failure | Cleanup runs in finally block; startup checks for stale worktrees |
| Haiku produces lower-quality plans | Plans are validated against JSON schema; fallback to Sonnet if validation fails |
| Speculative test causes cascade | Opt-in flag; cancellation of in-progress waves on fix trigger |
| Event flood overwhelms frontend | 100ms batching + 200ms UI debounce |
| Fixer patch makes things worse | Fast-fail after one attempt; full Coder re-implementation as fallback |

---

## Files Changed

**New files:**
- `backend/scheduler.py` — StepScheduler (dependency analysis, wave grouping)
- `backend/wave_executor.py` — WaveExecutor (parallel Coder spawning, worktree management)
- `backend/merge_coordinator.py` — MergeCoordinator (worktree merging)

**Modified files:**
- `backend/config.py` — AGENT_MODELS dict, SPECULATIVE_TEST flag, event batching config
- `backend/graph.py` — New nodes, nested subgraph compilation, updated routing
- `backend/state.py` — New state fields (waves, current_wave, wave_results, worktree_paths)
- `backend/agents/planner.py` — Dependency graph output, Haiku model
- `backend/agents/coder.py` — Parallel tool execution, worktree-aware paths, worker_id tagging
- `backend/agents/tester.py` — Haiku model, speculative test support
- `backend/agents/fixer.py` — ReAct loop, two-tier fix (Haiku analysis + Sonnet patching)
- `backend/agents/supervisor.py` — Updated routing for new nodes/states
- `backend/main.py` — Event batching, new event types
- `backend/live_events.py` — worker_id tagging, batch accumulation
- `frontend/src/hooks/useWebSocket.ts` — New event types, wave state, worker tracking
- `frontend/src/lib/types.ts` — New types (Wave, WorkerEvent, etc.)
- `frontend/src/app/page.tsx` — Wave-based layout, multi-track tabs
- `frontend/src/components/PlanView.tsx` — Wave grouping visualization
- `frontend/src/components/TerminalOutput.tsx` — Multi-track tabbed output
- `frontend/src/components/LiveActivityFeed.tsx` — Throttled updates
- `frontend/src/components/StatusBar.tsx` — Wave progress bar

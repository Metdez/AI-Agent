# DeepDev Performance Optimization — Full Concurrency Design

## Problem

DeepDev's pipeline is fully sequential: Planner -> Coder (step by step) -> Tester -> Fixer loop. A typical 3-step task takes 3-7 minutes. The user wants 3-5x speedup through parallelism, smarter model usage, and architectural improvements, while also making the UI feel more responsive.

## Goals

1. **Wall-clock speedup of 2-4x** on multi-step tasks
2. **Perceived speed improvement** — UI shows parallel progress, feels snappier
3. **Maintain correctness** — parallel execution must not introduce merge conflicts or broken state

## Constraints

- Must work with the existing Claude API (no custom inference infrastructure)
- Must preserve the existing WebSocket protocol (additive changes only)
- Git worktrees require the target repo to be a git repository
- Speculative testing is opt-in (config flag) due to added complexity
- Target environment is Windows — worktree strategy must account for Windows path limits and file locking

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

**Planner output schema:** The planner returns an extended JSON object. The JSON is validated against a schema; if validation fails, the scheduler falls back to treating all steps as sequential (one step per wave).

```json
{
  "steps": [
    {"step": 1, "description": "Create models", "files": ["src/models.py"]},
    {"step": 2, "description": "Create API", "files": ["src/api.py", "src/models.py"]}
  ],
  "dependencies": {"2": [1], "5": [3, 4]},
  "file_mapping": {
    "1": {"reads": [], "writes": ["src/models.py"]},
    "2": {"reads": ["src/models.py"], "writes": ["src/api.py"]}
  }
}
```

**Git worktree isolation:** Each concurrent Coder gets its own git worktree (`git worktree add`). This avoids file conflicts entirely — each agent works in a clean copy of the repo.

**Windows-specific considerations:**
- Worktree paths are kept short (e.g., `<repo>/../.deepdev-wt-<step>`) to avoid MAX_PATH (260 char) issues
- Worktree cleanup uses `git worktree remove --force` with retry logic for Windows file locking
- Startup checks for and cleans stale worktrees from prior interrupted runs
- If worktree creation fails (antivirus lock, path issue), that step falls back to sequential execution on the main worktree

**Merge strategy after wave completion:**
1. Pick one worktree as base (most changes)
2. Cherry-pick or merge changes from other worktrees
3. If merge conflict occurs (shouldn't if dependency analysis is correct), fall back to sequential re-execution of conflicting steps
4. Clean up worktrees after merge

**Worktree overhead:** Creating a worktree involves disk I/O for a full working copy. On Windows with antivirus, this can take 5-15 seconds per worktree. This overhead is amortized when steps take 30-60+ seconds each, but for very short steps the overhead may negate the parallelism benefit. The scheduler should only parallelize when wave steps are estimated to take >15 seconds each (based on file count heuristic).

### 2. Tiered Model Strategy

Different agents get different models based on task complexity:

| Agent | Model | Rationale |
|-------|-------|-----------|
| Planner | Sonnet (`claude-sonnet-4-6`) | Must produce structured dependency graph — needs full reasoning |
| Coder | Sonnet (`claude-sonnet-4-6`) | Needs full reasoning for implementation |
| Tester | Haiku (`claude-haiku-4-5-20251001`) | Test detection is pattern matching on config files |
| Fixer (analysis) | Haiku (`claude-haiku-4-5-20251001`) | Error analysis from stack traces is mechanical |
| Fixer (patching) | Sonnet (`claude-sonnet-4-6`) | Writing fix code needs full capability |

Note: The Planner stays on Sonnet because the new dependency graph output requires reasoning about transitive file relationships — a task where Haiku's lower capability would lead to incorrect dependency analysis and broken waves. The Tester and Fixer analysis phases are the ones that benefit most from Haiku's speed without sacrificing quality.

**Configuration:**
```python
AGENT_MODELS = {
    "planner": os.getenv("DEEPDEV_PLANNER_MODEL", "claude-sonnet-4-6"),
    "coder": os.getenv("DEEPDEV_CODER_MODEL", "claude-sonnet-4-6"),
    "tester": os.getenv("DEEPDEV_TESTER_MODEL", "claude-haiku-4-5-20251001"),
    "fixer_analysis": os.getenv("DEEPDEV_FIXER_ANALYSIS_MODEL", "claude-haiku-4-5-20251001"),
    "fixer_patch": os.getenv("DEEPDEV_FIXER_PATCH_MODEL", "claude-sonnet-4-6"),
}
```

Each model is overridable via environment variable. Model IDs use pinned versions; users can set `claude-haiku-4-5-latest` if they prefer tracking the latest release.

**Expected impact:** Haiku calls return 2-5x faster than Sonnet. Tester and Fixer analysis are on the critical path and benefit from this speedup.

### 3. Fixer Agent Overhaul

**Current flow:**
```
Tests fail -> Fixer analyzes failure and produces error_analysis
  -> Backs up current_step by one, marks step as "[FIX] <description>"
  -> Routes to Coder, which re-runs the step with error_analysis in context
  -> Test again
```

The current Fixer already provides useful error context to the Coder — it does NOT blindly re-implement from scratch. However, the Coder still re-runs the entire step's ReAct loop (up to 15 iterations) even when the fix might be a one-line change. This is where time is wasted.

**New two-tier flow:**
```
Tests fail -> Fixer analyzes failure (Haiku) -> Fixer applies targeted patch (Sonnet) -> Test again
                                                    |
                                                    v (if patch fails tests)
                                                Coder re-runs step with error context (existing behavior) -> Test again
```

**Changes:**
- Fixer gets its own ReAct loop with same tool access as Coder (read_file, write_file, run_command, git_commit). Max 5 iterations (shorter than Coder's 15 since patches should be small).
- Two-phase: Haiku analyzes failure (which test, why, suspect lines), then Sonnet applies targeted patch (editing only broken lines rather than re-running the whole step)
- Scoped context: Fixer receives only failing test output + modified files from the failing step, not entire conversation history. This keeps context small and focused.
- Fast-fail: If Fixer's patch doesn't pass tests on the first try, immediately fall back to Coder re-implementation with error context (existing behavior)

**Fix attempt budget (3 total):**
1. Fixer targeted patch (new — fast, scoped)
2. Coder re-implementation with Fixer analysis (existing behavior)
3. Coder re-implementation with both prior failure contexts
4. After 3: task fails

**Expected improvement:** Saves ~30-60s per fix attempt when the Fixer's patch succeeds (avoids Coder's full ReAct loop). When it doesn't, falls back to existing behavior with no additional cost beyond the Fixer's attempt (~10-15s).

### 4. Parallel Tool Execution

When Claude returns multiple tool calls in one response, execute them concurrently:

```python
# Current (serial)
for tool_call in tool_calls:
    result = execute_tool(tool_call)

# New (parallel)
results = await asyncio.gather(*[execute_tool(tc) for tc in tool_calls])
```

**Safety guard:** This applies only to tool calls within a single LLM response (where the LLM planned them as a batch). Write-write conflicts on the same file fall back to serial for that pair. Cross-step read-write safety is handled by the dependency graph at the wave level, not here.

### 5. Speculative Testing

Instead of waiting for ALL waves to complete before testing, the Tester starts after each wave merge:

```
Wave 1 complete -> Tester runs on Wave 1 code
Wave 2 running simultaneously
  |
  v
Wave 1 tests pass -> Wave 2 continues
Wave 1 tests fail -> Fixer starts on Wave 1, Wave 2 runs to completion before fix is applied
Wave 2 complete -> Full test suite runs
```

**Guard rails:**
- Speculative tests run on the main worktree after wave merge
- If a speculative test triggers a fix, in-progress waves are NOT cancelled — they run to completion first. Cancelling mid-execution would waste the in-progress API calls (billed regardless) and risk half-written files. After all in-progress waves complete and merge, the fix is applied, then remaining waves execute.
- Opt-in via `DEEPDEV_SPECULATIVE_TEST=true`

### 6. Streaming & Frontend Optimizations

**Backend:**
- **Adaptive event batching:** When multiple workers are active, accumulate events over 100ms windows and send as JSON array. When a single worker is active, send events immediately (no added latency).
- **Agent-tagged events:** Every event carries `worker_id` (e.g., `"coder-step-1"`) so frontend knows which parallel track it belongs to.
- **Heartbeat consolidation:** One heartbeat for the whole system instead of per-agent. Content shows aggregate status: `"Wave 1: steps 1,3 coding | step 4 complete"`.

**Frontend:**
- **Parallel step visualization:** PlanView shows waves as grouped rows. Steps in same wave appear side-by-side with independent progress indicators.
- **Multi-track terminal:** Terminal output tabbed by worker_id, plus "All" tab for interleaved view.
- **Activity feed throttling:** Debounce UI updates to 200ms max when multiple workers active.
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

**New flow using LangGraph's `Send` API for fan-out:**
```
planner -> step_scheduler -> [fan-out via Send] -> merge_coordinator -> speculative_tester -> ... -> done/failed
                                    |
                          parallel coder nodes:
                          +-- coder (worktree 1)
                          +-- coder (worktree 2)
                          +-- coder (worktree 3)
```

**Parallel execution mechanism:** LangGraph's `Send` API (available in langgraph>=0.4.0) enables map-reduce patterns. The `step_scheduler` returns a list of `Send("coder_worker", {...})` objects via a conditional edge, which LangGraph executes in parallel. Each parallel coder worker operates on its own worktree and produces independent state updates.

```python
from langgraph.graph import Send

def schedule_wave(state: DeepDevState) -> list[Send]:
    """Fan out: spawn one coder_worker per step in the current wave."""
    wave_steps = state["waves"][state["current_wave"]]
    return [
        Send("coder_worker", {
            "step_index": step_idx,
            "step": state["plan"][step_idx],
            "repo_path": state["repo_path"],
            "branch_name": state["branch_name"],
            "error_analysis": state.get("error_analysis", ""),
        })
        for step_idx in wave_steps
    ]
```

**Message handling with parallel execution:** The `messages` field uses LangGraph's `add_messages` reducer, which automatically merges message lists from parallel executions. However, parallel coder workers should NOT append to the shared `messages` list — their conversation histories are independent and interleaving them would produce incoherent context. Instead:

- Each coder worker maintains a local message history (not part of DeepDevState)
- Workers return only structured results to the shared state via `wave_results` (a dict reducer that merges per-step results)
- The main `messages` list is only appended to by single-execution nodes (planner, tester, fixer)

**New nodes:**

| Node | Responsibility |
|------|---------------|
| `step_scheduler` | Reads plan + dependencies, groups into waves, returns `Send` list for fan-out |
| `coder_worker` | Single-step coder with its own worktree — receives step config, returns results |
| `merge_coordinator` | Merges worktree results back to main branch, handles conflicts |
| `speculative_tester` | Runs tests after each wave merge (overlaps with next wave if enabled) |

**Updated supervisor routing:**
```python
def route_next(state):
    if state["status"] == "planning" and state["plan"]:
        return "step_scheduler"
    if state["status"] == "scheduling":
        return schedule_wave  # returns list[Send] for fan-out
    if state["status"] == "wave_coding_complete":
        return "merge_coordinator"
    if state["status"] == "wave_merged":
        return "speculative_tester"
    if state["status"] == "testing" and state["test_passed"]:
        if state["current_wave"] < len(state["waves"]) - 1:
            return "step_scheduler"  # next wave
        return "done"
    if state["status"] == "testing" and not state["test_passed"]:
        if state["fix_attempts"] < 3:
            return "fixer"
        return "failed"
    if state["status"] == "fixing":
        return "step_scheduler"  # re-schedule failed steps as a new wave
```

**Complete updated state definition:**
```python
from typing import TypedDict, Annotated
from langgraph.graph import add_messages


class PlanStep(TypedDict):
    step: int
    description: str
    files: list[str]        # files to create/modify
    status: str             # pending | active | done | failed
    reads: list[str]        # files this step reads (new)
    writes: list[str]       # files this step writes (new)


class WaveResult(TypedDict):
    step_index: int
    files_modified: list[str]
    worktree_path: str
    success: bool
    error: str              # empty if success


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
    status: str
    # Status values: planning | scheduling | wave_coding_complete |
    #   wave_merged | coding | testing | fixing | done | failed
    ws_events: list[dict]

    # --- new fields ---
    dependencies: dict[str, list[int]]    # step -> list of step indices it depends on
    waves: list[list[int]]                # [[1,3,4], [2], [5]] -- step groups
    current_wave: int                     # index into waves
    wave_results: dict[int, WaveResult]   # per-step results from parallel execution
    worktree_paths: dict[int, str]        # step -> worktree path mapping
    speculative_test: bool                # config flag (from DEEPDEV_SPECULATIVE_TEST)
```

**Persistence and resume:** The `save_state` function is updated to persist the new fields (`waves`, `current_wave`, `wave_results`, `dependencies`). If execution is interrupted mid-wave, resume logic detects incomplete wave_results and re-schedules the entire wave (worktrees from the interrupted run are cleaned up on startup). Partially completed steps within the wave are discarded — it's simpler and safer to re-run the full wave than attempt to resume individual worktrees.

---

## Expected Performance

| Scenario | Current | After Optimization | Notes |
|----------|---------|-------------------|-------|
| 3-step task (no deps) | ~200s | ~80-110s (1 wave) | Includes ~15s worktree overhead on Windows |
| 5-step task (2 waves) | ~400s | ~150-200s | Two wave rounds + merge overhead |
| Fix needed (1 attempt) | +80-100s | +30-50s (Fixer patches directly) | Current Fixer already provides context; gain is avoiding full ReAct loop |
| Tester phase | 20-60s | 10-30s (Haiku + no LLM for detection) | Test framework detection is now config-file pattern matching |

**Overall: 2-4x speedup on typical multi-step tasks.** The range depends on step independence (more parallel waves = more speedup) and Windows disk I/O overhead.

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Git merge conflicts | Dependency analysis prevents shared-file parallelism; conflict = sequential fallback |
| Worktree cleanup failure | Cleanup uses `git worktree remove --force` with retry; startup purges stale worktrees |
| Windows path length limits | Worktree paths kept short (`../.deepdev-wt-<N>`); fallback to sequential if creation fails |
| Windows file locking | Retry cleanup with exponential backoff (3 attempts); log warning if cleanup fails |
| Planner dependency graph wrong | JSON schema validation; fallback to all-sequential waves if validation fails |
| Speculative test causes cascade | In-progress waves run to completion; fix applied after merge, not mid-wave |
| Event flood overwhelms frontend | Adaptive batching (100ms when parallel, immediate when single); 200ms UI debounce |
| Fixer patch makes things worse | Fast-fail after one attempt; full Coder re-implementation as fallback |
| Parallel messages corruption | Coder workers use local message history; shared `messages` field only used by single-execution nodes |
| Worktree overhead negates gains | Scheduler only parallelizes when steps estimated >15s; short steps stay sequential |

---

## Files Changed

**New files:**
- `backend/scheduler.py` — StepScheduler (dependency analysis, wave grouping, `Send` fan-out)
- `backend/wave_executor.py` — coder_worker node (single-step coder with worktree isolation)
- `backend/merge_coordinator.py` — MergeCoordinator (worktree merging, conflict handling)
- `frontend/src/components/PlanView.tsx` — Wave grouping visualization (new component)
- `frontend/src/components/TerminalOutput.tsx` — Multi-track tabbed terminal output (new component)

**Modified files:**
- `backend/config.py` — AGENT_MODELS dict, SPECULATIVE_TEST flag, event batching config
- `backend/graph.py` — New nodes (step_scheduler, coder_worker, merge_coordinator, speculative_tester), Send-based fan-out, updated routing
- `backend/state.py` — New state fields, WaveResult TypedDict, updated PlanStep with reads/writes, new status values
- `backend/agents/planner.py` — Dependency graph output in prompt + response parsing
- `backend/agents/coder.py` — Parallel tool execution, worktree-aware paths, worker_id tagging
- `backend/agents/tester.py` — Haiku model, speculative test support
- `backend/agents/fixer.py` — ReAct loop with tool access, two-tier fix (Haiku analysis + Sonnet patching)
- `backend/agents/supervisor.py` — Updated routing for new nodes/states, schedule_wave fan-out function
- `backend/main.py` — Adaptive event batching, new event types
- `backend/live_events.py` — worker_id tagging, batch accumulation
- `backend/persistence.py` — Persist new state fields, wave resume logic, stale worktree cleanup
- `frontend/src/hooks/useWebSocket.ts` — New event types, wave state, worker tracking
- `frontend/src/lib/types.ts` — New types (Wave, WaveResult, WorkerEvent, updated PlanStep)
- `frontend/src/app/page.tsx` — Wave-based layout, multi-track tabs
- `frontend/src/components/LiveActivityFeed.tsx` — Throttled updates
- `frontend/src/components/StatusBar.tsx` — Wave progress bar, aggregate heartbeat display

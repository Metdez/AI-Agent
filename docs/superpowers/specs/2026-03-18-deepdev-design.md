# DeepDev — Autonomous Multi-Agent Coding System

## Overview

A full-autopilot, multi-agent autonomous coding system built on LangGraph with a real-time streaming web UI. Give it a task, point it at a repo, and watch it plan, code, test, and self-correct — all on a git branch with clean commits.

## Decisions

- **Autonomy:** Full autopilot — human only reviews the final branch
- **Language scope:** Language-agnostic — works on any codebase via shell commands
- **Interface:** Web app with real-time streaming UI
- **Execution:** Local (no sandboxing) — git provides safety net
- **Git workflow:** Always works on a new branch, commits at each milestone

## Architecture

### Agent Hierarchy

```
Supervisor (orchestrator)
├── Planner   — decomposes task into step-by-step plan
├── Coder     — implements each step, writes files
├── Tester    — runs tests, analyzes failures
└── Fixer     — reflects on failures, produces fixes
```

### Flow

```
User Task → Supervisor → Planner → [plan]
                       → Coder  → [code written, committed]
                       → Tester → [tests run]
                           ├── PASS → Supervisor → Done (merge-ready branch)
                           └── FAIL → Fixer → [analysis + fix strategy]
                                    → Coder → [fix applied]
                                    → Tester → (loop, max 3 retries)
```

### State Schema

```python
class DeepDevState(TypedDict):
    task: str                    # User's task description
    repo_path: str               # Path to the git repo
    branch_name: str             # Working branch name
    plan: list[dict]             # Steps from Planner [{step, description, status}]
    current_step: int            # Index of current plan step
    files_modified: list[str]    # Files touched so far
    test_results: str            # Latest test output
    test_passed: bool            # Whether tests passed
    error_analysis: str          # Fixer's analysis of failures
    fix_attempts: int            # Number of fix attempts (max 3)
    messages: list               # Agent message history
    status: str                  # current phase: planning|coding|testing|fixing|done|failed
```

### WebSocket API Contract

All communication between frontend and backend happens over WebSocket.

**Client → Server:**
```json
{"type": "start_task", "task": "Build a REST API...", "repo_path": "/path/to/repo"}
{"type": "cancel"}
```

**Server → Client (streaming events):**
```json
{"type": "status", "agent": "supervisor|planner|coder|tester|fixer", "status": "active|complete|error"}
{"type": "plan", "steps": [{"step": 1, "description": "...", "status": "pending|active|done|failed"}]}
{"type": "code", "file": "path/to/file.py", "content": "...", "action": "create|modify|delete"}
{"type": "terminal", "output": "...", "stream": "stdout|stderr"}
{"type": "git", "action": "branch|commit", "message": "...", "branch": "..."}
{"type": "thinking", "agent": "planner", "content": "Analyzing requirements..."}
{"type": "complete", "summary": "...", "branch": "...", "commits": 5}
{"type": "error", "message": "...", "recoverable": true}
```

## Tech Stack

- **Backend:** Python 3.11+, LangGraph, FastAPI, uvicorn, GitPython, websockets
- **Frontend:** Next.js 14, React 18, TypeScript, TailwindCSS
- **LLM:** Claude Sonnet 4.6 via Anthropic API (ANTHROPIC_API_KEY from .env)
- **Git:** GitPython for branch/commit management

## Agent Details

### Supervisor
- Orchestrates the pipeline: plan → code → test → fix loop
- Decides when to move between phases
- Enforces max retry limit (3 fix attempts)
- Streams status updates to frontend

### Planner
- Receives task description + repo context (file tree, README, key files)
- Produces ordered list of implementation steps
- Each step: what to do, which files to create/modify, dependencies
- Commits plan as `plan.md` in the branch

### Coder
- Takes one plan step at a time
- Has tools: read_file, write_file, list_files, shell_command
- Writes/modifies code, then commits with descriptive message
- Moves to next step when current step is implemented

### Tester
- Runs test commands (auto-detects: pytest, npm test, cargo test, go test, etc.)
- Parses output, identifies pass/fail
- On failure: extracts error messages, failing test names, stack traces

### Fixer
- Receives: failing test output + relevant code files
- Analyzes root cause
- Produces fix strategy (which files to change, how)
- Hands back to Coder for implementation

## File Structure

```
deepdev/
├── backend/
│   ├── requirements.txt
│   ├── main.py              # FastAPI + WebSocket entry point
│   ├── state.py             # LangGraph state schema
│   ├── graph.py             # Main graph definition
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── supervisor.py
│   │   ├── planner.py
│   │   ├── coder.py
│   │   ├── tester.py
│   │   └── fixer.py
│   └── tools/
│       ├── __init__.py
│       ├── file_ops.py      # Read, write, list, search files
│       ├── shell.py         # Execute shell commands
│       └── git_ops.py       # Branch, commit, diff, log
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── postcss.config.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── TaskInput.tsx
│   │   │   ├── AgentTimeline.tsx
│   │   │   ├── CodeViewer.tsx
│   │   │   ├── TerminalOutput.tsx
│   │   │   └── GitLog.tsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts
│   │   └── lib/
│   │       └── types.ts
│   └── public/
└── README.md
```

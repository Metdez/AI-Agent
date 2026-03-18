# DeepDev — Autonomous Multi-Agent Coding System

## Purpose
Full-autopilot coding agent: give it a task description and a repo path, it plans, codes, tests, and self-corrects on a git branch with streaming UI.

## Architecture
Multi-agent LangGraph system with 4 specialist agents orchestrated by a supervisor:

1. **Planner** — Reads repo context, decomposes task into ordered steps
2. **Coder** — Implements each step using file/shell/git tools (ReAct loop)
3. **Tester** — Auto-detects test framework, runs tests, reports pass/fail
4. **Fixer** — Analyzes failures, produces fix strategy, hands back to Coder

Flow: `Planner → Coder → Tester → (pass? Done : Fixer → Coder → Tester)` — max 3 fix attempts.

## Inputs
- Task description (natural language)
- Repository path (local filesystem)

## Tools / Scripts
- `deepdev/backend/main.py` — FastAPI server with WebSocket streaming (port 8000)
- `deepdev/frontend/` — Next.js app with real-time UI (port 3000)

## Running
```bash
# Backend
cd deepdev/backend
pip install -r requirements.txt
python main.py

# Frontend (separate terminal)
cd deepdev/frontend
npm install
npm run dev
```

Then open http://localhost:3000

## How It Works
1. User enters task + repo path in the web UI
2. Backend creates a new git branch (deepdev/<task-slug>)
3. Supervisor dispatches agents in sequence
4. All events stream to frontend via WebSocket in real-time
5. Git commits at each milestone (plan, each code step, fixes)
6. Result: a clean branch ready for review/merge

## Environment
- Requires `ANTHROPIC_API_KEY` in `.env`
- Uses Claude Sonnet 4.6 for all LLM calls
- Language-agnostic: works on any codebase

## Edge Cases & Learnings
- If no test framework detected, Tester reports "no tests found" and marks as pass
- Fix loop capped at 3 attempts to prevent infinite loops
- Shell commands timeout after 120 seconds
- File operations are sandboxed to repo_path (no path traversal)

## Outputs
- Git branch with clean commits
- Real-time streaming UI showing agent activity
- Completion summary with branch name and commit count

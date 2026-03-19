"""Persistence layer — saves/loads DeepDev state to .deepdev/state.json in the target repo."""

import json
import os
import time
from typing import Optional

SAVE_DIR = ".deepdev"
SAVE_FILE = "state.json"

# Only persist structural fields (skip messages, ws_events — they're ephemeral)
PERSIST_FIELDS = [
    "task", "repo_path", "branch_name", "plan", "current_step",
    "files_modified", "test_results", "test_passed", "error_analysis",
    "fix_attempts", "status",
    # Parallel execution fields (wave_results/worktree_paths are ephemeral)
    "dependencies", "waves", "current_wave",
]


def _save_path(repo_path: str) -> str:
    return os.path.join(repo_path, SAVE_DIR, SAVE_FILE)


def save_state(state: dict) -> None:
    """Save persistable fields to .deepdev/state.json in the target repo."""
    repo_path = state.get("repo_path", "")
    if not repo_path:
        return

    save_dir = os.path.join(repo_path, SAVE_DIR)
    os.makedirs(save_dir, exist_ok=True)

    # Write a .gitignore in .deepdev/ so state isn't committed
    gi_path = os.path.join(save_dir, ".gitignore")
    if not os.path.isfile(gi_path):
        with open(gi_path, "w", encoding="utf-8") as f:
            f.write("*\n")

    data = {k: state.get(k) for k in PERSIST_FIELDS if k in state}
    data["saved_at"] = time.time()

    path = _save_path(repo_path)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def load_state(repo_path: str) -> Optional[dict]:
    """Load saved state. Returns None if not found or corrupt."""
    path = _save_path(repo_path)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data.get("plan"), list) or not data.get("task"):
            return None
        return data
    except (json.JSONDecodeError, OSError):
        return None


def delete_state(repo_path: str) -> None:
    """Delete saved state file."""
    path = _save_path(repo_path)
    if os.path.isfile(path):
        os.remove(path)

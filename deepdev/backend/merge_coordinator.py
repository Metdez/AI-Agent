"""Merge coordinator for DeepDev parallel execution.

After parallel coders finish working in separate git worktrees, this module
merges their changes back into the main branch.
"""

import logging
import os
import re
import subprocess
import time
from typing import Any

from state import DeepDevState, WaveResult

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run_git(args: list[str], cwd: str, check: bool = True) -> subprocess.CompletedProcess:
    """Run a git command with consistent settings."""
    cmd = ["git"] + args
    logger.debug("git %s  (cwd=%s)", " ".join(args), cwd)
    return subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        check=check,
    )


# ---------------------------------------------------------------------------
# Worktree lifecycle
# ---------------------------------------------------------------------------

def create_worktree(repo_path: str, step_index: int, branch_name: str) -> str:
    """Create a git worktree for a parallel coder step.

    The worktree is placed at ``<repo_parent>/.deepdev-wt-<step_index>`` to
    keep paths short (Windows MAX_PATH compatibility).

    Returns the absolute path of the new worktree.
    """
    repo_parent = os.path.dirname(os.path.abspath(repo_path))
    wt_dir = os.path.join(repo_parent, f".deepdev-wt-{step_index}")
    wt_branch = f"deepdev-wt-{step_index}"

    try:
        _run_git(
            ["worktree", "add", wt_dir, "-b", wt_branch, branch_name],
            cwd=repo_path,
        )
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"Failed to create worktree for step {step_index} at {wt_dir}: "
            f"{exc.stderr.strip()}"
        ) from exc

    logger.info("Created worktree step=%d path=%s", step_index, wt_dir)
    return wt_dir


def cleanup_worktree(repo_path: str, worktree_path: str) -> None:
    """Remove a worktree and its temporary branch.

    Retries up to 3 times with 1-second delays to handle Windows file locking.
    Logs a warning instead of raising if cleanup fails.
    """
    # Extract step index from the worktree directory name.
    wt_name = os.path.basename(worktree_path)
    match = re.search(r"\.deepdev-wt-(\d+)$", wt_name)
    wt_branch = f"deepdev-wt-{match.group(1)}" if match else None

    # Remove worktree (with retries for Windows file locks).
    for attempt in range(1, 4):
        result = _run_git(
            ["worktree", "remove", "--force", worktree_path],
            cwd=repo_path,
            check=False,
        )
        if result.returncode == 0:
            logger.info("Removed worktree %s", worktree_path)
            break
        if attempt < 3:
            logger.warning(
                "Worktree remove attempt %d/3 failed (%s), retrying...",
                attempt,
                result.stderr.strip(),
            )
            time.sleep(1)
        else:
            logger.warning(
                "Could not remove worktree %s after 3 attempts: %s",
                worktree_path,
                result.stderr.strip(),
            )

    # Delete the temporary branch.
    if wt_branch:
        result = _run_git(
            ["branch", "-D", wt_branch],
            cwd=repo_path,
            check=False,
        )
        if result.returncode == 0:
            logger.debug("Deleted branch %s", wt_branch)
        else:
            logger.warning(
                "Could not delete branch %s: %s",
                wt_branch,
                result.stderr.strip(),
            )


def cleanup_stale_worktrees(repo_path: str) -> None:
    """Remove any leftover ``.deepdev-wt-*`` worktrees from prior runs.

    Intended to be called at startup.
    """
    result = _run_git(["worktree", "list", "--porcelain"], cwd=repo_path, check=False)
    if result.returncode != 0:
        logger.warning("Could not list worktrees: %s", result.stderr.strip())
        return

    # Parse porcelain output: each worktree block starts with "worktree <path>".
    for line in result.stdout.splitlines():
        if line.startswith("worktree "):
            wt_path = line[len("worktree "):].strip()
            if os.path.basename(wt_path).startswith(".deepdev-wt-"):
                logger.info("Cleaning stale worktree: %s", wt_path)
                cleanup_worktree(repo_path, wt_path)

    # Prune any worktree metadata that lost its directory.
    _run_git(["worktree", "prune"], cwd=repo_path, check=False)


# ---------------------------------------------------------------------------
# Merge logic
# ---------------------------------------------------------------------------

def _count_changed_files(repo_path: str, branch: str, base_branch: str) -> int:
    """Return the number of files changed on *branch* relative to *base_branch*."""
    result = _run_git(
        ["diff", "--name-only", f"{base_branch}...{branch}"],
        cwd=repo_path,
        check=False,
    )
    if result.returncode != 0:
        return 0
    return len([f for f in result.stdout.strip().splitlines() if f])


def merge_worktrees(
    repo_path: str,
    wave_results: dict[int, WaveResult],
    branch_name: str,
) -> tuple[bool, list[str]]:
    """Merge completed parallel worktrees back into *branch_name*.

    Strategy:
    1. Pick the worktree with the most file changes as the base — merge it
       first (fast-forward or merge commit).
    2. Cherry-pick commits from each remaining worktree onto *branch_name*.

    Returns ``(True, [])`` on success, or ``(False, [<step indices>])`` listing
    the steps that produced merge conflicts.
    """
    successful = {
        idx: wr for idx, wr in wave_results.items() if wr.get("success")
    }

    if not successful:
        return (True, [])

    # Ensure we're on the target branch.
    _run_git(["checkout", branch_name], cwd=repo_path)

    # Rank worktrees by number of changed files (descending).
    ranked: list[tuple[int, WaveResult]] = sorted(
        successful.items(),
        key=lambda pair: _count_changed_files(
            repo_path,
            f"deepdev-wt-{pair[0]}",
            branch_name,
        ),
        reverse=True,
    )

    conflicts: list[str] = []

    for i, (step_idx, wr) in enumerate(ranked):
        wt_branch = f"deepdev-wt-{step_idx}"

        if i == 0:
            # Merge the largest changeset directly.
            result = _run_git(
                ["merge", wt_branch, "--no-edit", "-m",
                 f"deepdev: merge step {step_idx}"],
                cwd=repo_path,
                check=False,
            )
        else:
            # Cherry-pick commits from the worktree branch that sit on top of
            # the base branch.
            log_result = _run_git(
                ["log", f"{branch_name}..{wt_branch}", "--reverse",
                 "--format=%H"],
                cwd=repo_path,
                check=False,
            )
            commits = [c for c in log_result.stdout.strip().splitlines() if c]
            if not commits:
                continue

            result = _run_git(
                ["cherry-pick", "--no-edit"] + commits,
                cwd=repo_path,
                check=False,
            )

        if result.returncode != 0:
            logger.error(
                "Merge conflict for step %d: %s",
                step_idx,
                result.stderr.strip(),
            )
            conflicts.append(str(step_idx))
            # Abort any in-progress cherry-pick / merge so the repo is clean.
            _run_git(["cherry-pick", "--abort"], cwd=repo_path, check=False)
            _run_git(["merge", "--abort"], cwd=repo_path, check=False)

    # Clean up all worktrees regardless of outcome.
    for step_idx, wr in wave_results.items():
        wt_path = wr.get("worktree_path", "")
        if wt_path:
            cleanup_worktree(repo_path, wt_path)

    if conflicts:
        return (False, conflicts)
    return (True, [])


# ---------------------------------------------------------------------------
# LangGraph node
# ---------------------------------------------------------------------------

def merge_coordinator_node(state: DeepDevState) -> dict[str, Any]:
    """LangGraph node that merges parallel worktree results.

    On success:
        - Aggregates ``files_modified`` from all wave results.
        - Sets ``status`` to ``"wave_merged"``.
        - Appends a ``wave_completed`` event.

    On conflict:
        - Marks conflicting steps for sequential re-execution.
        - Sets ``status`` to ``"scheduling"`` so the scheduler can retry.

    Always increments ``current_wave``.
    """
    repo_path: str = state["repo_path"]
    branch_name: str = state["branch_name"]
    wave_results: dict[int, WaveResult] = state.get("wave_results", {})
    current_wave: int = state.get("current_wave", 0)
    waves: list[list[int]] = state.get("waves", [])
    plan: list[dict] = list(state.get("plan", []))
    existing_files: list[str] = list(state.get("files_modified", []))
    ws_events: list[dict] = list(state.get("ws_events", []))

    success, conflicts = merge_worktrees(repo_path, wave_results, branch_name)

    next_wave = current_wave + 1

    if success:
        # Collect all files modified across wave results.
        new_files: list[str] = []
        for wr in wave_results.values():
            new_files.extend(wr.get("files_modified", []))
        all_files = list(dict.fromkeys(existing_files + new_files))  # dedupe, preserve order

        # Mark completed steps as done.
        if current_wave < len(waves):
            for step_idx in waves[current_wave]:
                if 0 <= step_idx < len(plan):
                    plan[step_idx] = {**plan[step_idx], "status": "done"}

        ws_events.append({
            "type": "wave_completed",
            "wave": current_wave,
            "steps": waves[current_wave] if current_wave < len(waves) else [],
            "files_modified": new_files,
        })

        return {
            "files_modified": all_files,
            "plan": plan,
            "status": "wave_merged",
            "current_wave": next_wave,
            "wave_results": {},
            "ws_events": ws_events,
        }

    else:
        # Move conflicting steps back to pending for sequential retry.
        conflict_indices = {int(c) for c in conflicts}
        for step_idx in conflict_indices:
            if 0 <= step_idx < len(plan):
                plan[step_idx] = {**plan[step_idx], "status": "pending"}

        logger.warning(
            "Wave %d had merge conflicts on steps %s — requeueing",
            current_wave,
            conflicts,
        )

        ws_events.append({
            "type": "wave_conflict",
            "wave": current_wave,
            "conflicting_steps": list(conflict_indices),
        })

        return {
            "plan": plan,
            "status": "scheduling",
            "current_wave": next_wave,
            "wave_results": {},
            "ws_events": ws_events,
        }

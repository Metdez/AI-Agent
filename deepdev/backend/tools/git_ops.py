"""Git operation tools using GitPython."""

import os
from git import Repo, InvalidGitRepositoryError
from langchain_core.tools import tool


def create_git_tools(repo_path: str) -> list:
    """Create git tools bound to a specific repo path."""

    resolved_repo = os.path.abspath(repo_path)

    def _get_repo() -> Repo:
        """Get or initialize a git repo at the resolved path."""
        try:
            return Repo(resolved_repo)
        except InvalidGitRepositoryError:
            return Repo.init(resolved_repo)

    @tool
    def git_create_branch(branch_name: str = "") -> str:
        """Create and checkout a new git branch. If the branch already exists, just check it out.

        Args:
            branch_name: Name of the branch to create/checkout. REQUIRED.
        """
        try:
            repo = _get_repo()
            if branch_name in [b.name for b in repo.branches]:
                repo.git.checkout(branch_name)
                return f"Checked out existing branch: {branch_name}"
            repo.git.checkout("-b", branch_name)
            return f"Created and checked out branch: {branch_name}"
        except Exception as e:
            return f"Error creating branch: {e}"

    @tool
    def git_commit(message: str = "") -> str:
        """Stage all changes and create a git commit.

        Args:
            message: Commit message describing the changes. REQUIRED.
        """
        try:
            repo = _get_repo()
            repo.git.add("-A")
            # Check if there's anything to commit
            if not repo.is_dirty(untracked_files=True) and not repo.index.diff("HEAD"):
                return "Nothing to commit — working tree clean"
            repo.index.commit(message)
            sha = repo.head.commit.hexsha[:8]
            return f"Committed: {message} ({sha})"
        except Exception as e:
            return f"Error committing: {e}"

    @tool
    def git_diff() -> str:
        """Show the current git diff (staged and unstaged changes)."""
        try:
            repo = _get_repo()
            diff_output = repo.git.diff()
            staged_diff = repo.git.diff("--cached")
            untracked = repo.untracked_files

            parts = []
            if staged_diff:
                parts.append(f"=== Staged Changes ===\n{staged_diff}")
            if diff_output:
                parts.append(f"=== Unstaged Changes ===\n{diff_output}")
            if untracked:
                parts.append(f"=== Untracked Files ===\n" + "\n".join(untracked))
            if not parts:
                return "No changes detected"
            return "\n\n".join(parts)
        except Exception as e:
            return f"Error getting diff: {e}"

    @tool
    def git_log(n: int = 10) -> str:
        """Show recent git commits."""
        try:
            repo = _get_repo()
            log = repo.git.log(f"--oneline", f"-{n}")
            return log if log else "No commits yet"
        except Exception as e:
            return f"Error getting log: {e}"

    return [git_create_branch, git_commit, git_diff, git_log]

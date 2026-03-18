"""File operation tools for reading, writing, listing, and searching files."""

import os
import pathlib
import platform
import subprocess
from langchain_core.tools import tool
from config import TRUNCATE_SEARCH_LINES


_IS_WINDOWS = platform.system() == "Windows"


def create_file_tools(repo_path: str) -> list:
    """Create file operation tools bound to a specific repo path."""

    resolved_repo = pathlib.Path(repo_path).resolve()

    def _safe_path(relative: str) -> str:
        """Resolve a relative path against repo_path, preventing directory traversal."""
        target = pathlib.Path(os.path.join(str(resolved_repo), relative)).resolve()
        if not target.is_relative_to(resolved_repo):
            raise ValueError(f"Path escapes repo root: {relative}")
        return str(target)

    @tool
    def read_file(path: str) -> str:
        """Read a file from the repository. Path should be relative to the repo root."""
        try:
            full_path = _safe_path(path)
            with open(full_path, "r", encoding="utf-8") as f:
                return f.read()
        except FileNotFoundError:
            return f"Error: File not found: {path}"
        except UnicodeDecodeError:
            return f"Error: Cannot read binary file: {path}"
        except Exception as e:
            return f"Error reading file {path}: {e}"

    @tool
    def write_file(path: str, content: str = "") -> str:
        """Write content to a file in the repository. Creates directories if needed.

        Args:
            path: File path relative to the repo root (e.g. 'src/main.py')
            content: The full file content to write. REQUIRED — always provide the complete file content as a string.
        """
        try:
            full_path = _safe_path(path)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "w", encoding="utf-8", newline="\n") as f:
                f.write(content)
            return f"Successfully wrote {len(content)} bytes to {path}"
        except Exception as e:
            return f"Error writing file {path}: {e}"

    @tool
    def list_files(path: str = ".", pattern: str = "**/*") -> list[str]:
        """List files in the repository matching a glob pattern. Path is relative to repo root."""
        try:
            full_path = _safe_path(path)
            base = pathlib.Path(full_path)
            results = []
            for p in base.glob(pattern):
                if p.is_file():
                    rel = os.path.relpath(str(p), resolved_repo)
                    # Skip hidden dirs like .git
                    parts = pathlib.PurePath(rel).parts
                    if any(part.startswith(".git") for part in parts):
                        continue
                    results.append(rel.replace("\\", "/"))
            return sorted(results)[:500]  # cap to avoid huge outputs
        except Exception as e:
            return [f"Error listing files: {e}"]

    @tool
    def search_files(pattern: str, path: str = ".") -> str:
        """Search for a text pattern in files. Returns matching lines with file paths."""
        try:
            full_path = _safe_path(path)
            if _IS_WINDOWS:
                cmd = ["findstr", "/S", "/N", pattern, "*.*"]
            else:
                cmd = ["grep", "-rn", "--include=*.*", pattern, "."]
            result = subprocess.run(
                cmd,
                cwd=full_path,
                capture_output=True,
                text=True,
                timeout=30,
            )
            output = result.stdout.strip()
            if not output:
                return f"No matches found for pattern: {pattern}"
            lines = output.split("\n")
            if len(lines) > TRUNCATE_SEARCH_LINES:
                return "\n".join(lines[:TRUNCATE_SEARCH_LINES]) + f"\n... ({len(lines) - TRUNCATE_SEARCH_LINES} more lines)"
            return output
        except subprocess.TimeoutExpired:
            return "Error: Search timed out after 30 seconds"
        except Exception as e:
            return f"Error searching files: {e}"

    return [read_file, write_file, list_files, search_files]

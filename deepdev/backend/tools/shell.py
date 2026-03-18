"""Shell command execution tools."""

import os
import pathlib
import subprocess
from langchain_core.tools import tool
from config import SHELL_COMMAND_BLOCKLIST


def create_shell_tools(repo_path: str) -> list:
    """Create shell tools bound to a specific repo path as default working directory."""

    resolved_repo = pathlib.Path(repo_path).resolve()

    def _validate_command(command: str) -> str | None:
        """Return an error message if the command is blocked, else None."""
        cmd_lower = command.lower()
        for pattern in SHELL_COMMAND_BLOCKLIST:
            if pattern in cmd_lower:
                return f"Blocked: command matches blocklist pattern '{pattern}'"
        return None

    def _safe_cwd(cwd: str | None) -> str:
        """Validate that cwd stays within the repo root."""
        if cwd is None:
            return str(resolved_repo)
        target = pathlib.Path(cwd).resolve()
        if not target.is_relative_to(resolved_repo):
            raise ValueError(f"Working directory escapes repo root: {cwd}")
        return str(target)

    @tool
    def run_command(command: str, cwd: str = None) -> dict:
        """Run a shell command and return stdout, stderr, and return code. Timeout is 120 seconds. cwd defaults to the repo root if not specified."""
        try:
            # Check blocklist
            blocked = _validate_command(command)
            if blocked:
                return {"stdout": "", "stderr": blocked, "returncode": -1}

            working_dir = _safe_cwd(cwd)
            result = subprocess.run(
                command,
                shell=True,
                cwd=working_dir,
                capture_output=True,
                text=True,
                timeout=120,
            )
            return {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode,
            }
        except subprocess.TimeoutExpired:
            return {
                "stdout": "",
                "stderr": "Error: Command timed out after 120 seconds",
                "returncode": -1,
            }
        except Exception as e:
            return {
                "stdout": "",
                "stderr": f"Error running command: {e}",
                "returncode": -1,
            }

    return [run_command]

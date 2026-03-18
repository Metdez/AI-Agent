"""Tester agent — auto-detects test framework and runs tests."""

import os
import time
from state import DeepDevState
from tools.shell import create_shell_tools
from config import TRUNCATE_TERMINAL_OUTPUT


# Map of config file -> test command
TEST_FRAMEWORK_DETECTORS = [
    ("pytest.ini", "python -m pytest -v"),
    ("pyproject.toml", "python -m pytest -v"),
    ("setup.cfg", "python -m pytest -v"),
    ("package.json", "npm test"),
    ("Cargo.toml", "cargo test"),
    ("go.mod", "go test ./..."),
    ("Makefile", "make test"),
]


def _detect_test_command(repo_path: str) -> str | None:
    """Detect the appropriate test command based on project config files."""
    for config_file, command in TEST_FRAMEWORK_DETECTORS:
        if os.path.isfile(os.path.join(repo_path, config_file)):
            # For pyproject.toml, verify it actually has pytest config or test deps
            if config_file == "pyproject.toml":
                try:
                    with open(os.path.join(repo_path, config_file), "r") as f:
                        content = f.read()
                    if "pytest" not in content and "test" not in content.lower():
                        continue
                except Exception:
                    pass
            return command
    return None


def tester_node(state: DeepDevState) -> dict:
    """Run tests and determine pass/fail."""
    try:
        repo_path = state["repo_path"]
        ws_events = list(state.get("ws_events", []))

        ws_events.append({
            "type": "status_change",
            "timestamp": time.time(),
            "data": {"status": "testing", "message": "Running tests..."},
        })

        test_command = _detect_test_command(repo_path)

        if not test_command:
            ws_events.append({
                "type": "test_result",
                "timestamp": time.time(),
                "data": {
                    "passed": True,
                    "message": "No test framework detected — skipping tests",
                    "output": "",
                },
            })
            return {
                "test_results": "No test framework detected — skipping tests",
                "test_passed": True,
                "status": "testing",
                "ws_events": ws_events,
            }

        # Run the tests
        shell_tools = create_shell_tools(repo_path)
        run_cmd = next(t for t in shell_tools if t.name == "run_command")

        result = run_cmd.invoke({"command": test_command})

        stdout = result.get("stdout", "")
        stderr = result.get("stderr", "")
        returncode = result.get("returncode", -1)

        full_output = f"$ {test_command}\n"
        if stdout:
            full_output += stdout
        if stderr:
            full_output += f"\n{stderr}"

        test_passed = returncode == 0

        ws_events.append({
            "type": "terminal_output",
            "timestamp": time.time(),
            "data": {"command": test_command, "output": full_output[:TRUNCATE_TERMINAL_OUTPUT]},
        })

        ws_events.append({
            "type": "test_result",
            "timestamp": time.time(),
            "data": {
                "passed": test_passed,
                "message": "Tests passed" if test_passed else "Tests failed",
                "output": full_output[:TRUNCATE_TERMINAL_OUTPUT],
            },
        })

        return {
            "test_results": full_output[:TRUNCATE_TERMINAL_OUTPUT],
            "test_passed": test_passed,
            "status": "testing",
            "ws_events": ws_events,
        }

    except Exception as e:
        ws_events = list(state.get("ws_events", []))
        ws_events.append({
            "type": "error",
            "timestamp": time.time(),
            "data": {"message": f"Tester failed: {e}"},
        })
        return {
            "test_results": f"Error running tests: {e}",
            "test_passed": False,
            "status": "testing",
            "ws_events": ws_events,
        }

"""Centralized configuration for DeepDev backend."""

import os

# ---------------------------------------------------------------------------
# LLM
# ---------------------------------------------------------------------------
MODEL = os.getenv("DEEPDEV_MODEL", "claude-sonnet-4-6")

# ---------------------------------------------------------------------------
# Agent limits
# ---------------------------------------------------------------------------
MAX_TOOL_ITERATIONS = 25
MAX_FIX_ATTEMPTS = 3

# ---------------------------------------------------------------------------
# Truncation limits (characters)
# ---------------------------------------------------------------------------
TRUNCATE_TEST_RESULTS = 4000
TRUNCATE_FILE_CONTENT = 10000
TRUNCATE_README = 3000
TRUNCATE_TERMINAL_OUTPUT = 5000
TRUNCATE_THINKING = 2000
TRUNCATE_SEARCH_LINES = 100

# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------
CORS_ORIGINS = os.getenv("DEEPDEV_CORS_ORIGINS", "http://localhost:3000").split(",")
SERVER_HOST = os.getenv("DEEPDEV_HOST", "127.0.0.1")
SERVER_PORT = int(os.getenv("DEEPDEV_PORT", "8000"))

# ---------------------------------------------------------------------------
# Security — shell command blocklist
# ---------------------------------------------------------------------------
# Patterns that are blocked from shell execution. Each entry is checked as a
# substring of the full command string (lowercased).
SHELL_COMMAND_BLOCKLIST = [
    "rm -rf /",
    "rm -rf ~",
    "mkfs",
    "dd if=",
    ":(){",           # fork bomb
    "chmod -R 777 /",
    "curl | bash",
    "curl | sh",
    "wget | bash",
    "wget | sh",
    "> /dev/sda",
    "shutdown",
    "reboot",
    "poweroff",
    "format c:",
    "del /f /s /q c:",
]

# Repo paths the server is allowed to operate on. Empty list = allow any path
# that already exists on disk. Set via comma-separated env var.
ALLOWED_REPO_ROOTS = [
    p.strip()
    for p in os.getenv("DEEPDEV_ALLOWED_REPOS", "").split(",")
    if p.strip()
]

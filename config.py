"""
Configuration and constants for the DD Agent.
Loads API keys from .env and validates them at import time.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).parent / ".env")

# --- API Keys ---
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")
FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Validate all five keys at import time
_required_keys = {
    "ANTHROPIC_API_KEY": ANTHROPIC_API_KEY,
    "TAVILY_API_KEY": TAVILY_API_KEY,
    "PERPLEXITY_API_KEY": PERPLEXITY_API_KEY,
    "FIRECRAWL_API_KEY": FIRECRAWL_API_KEY,
    "GEMINI_API_KEY": GEMINI_API_KEY,
}

for _key_name, _key_value in _required_keys.items():
    if not _key_value:
        raise EnvironmentError(
            f"Missing required API key: {_key_name}. "
            f"Set it in .env or as an environment variable."
        )

# --- Model Configuration ---
LLM_MODEL = "claude-sonnet-4-5"
PERPLEXITY_MODEL = "sonar"
GEMINI_MODEL = "gemini-3-flash-preview"

# --- Limits ---
MAX_PDF_CHARS = 30000
MAX_RESEARCH_CHARS_PER_SECTION = 800
MINIMUM_RESEARCH_LENGTH = 300
MAX_SCRAPE_URLS = 2
MAX_RETRIES = 3
RETRY_SLEEP_SECONDS = 0.5
GAP_FILL_MAX_QUERIES = 7

# --- Memo Configuration ---
MEMO_MAX_TOKENS = 5000

# --- Research Prioritization & Batching ---
RESEARCH_BATCH_SIZE = 9
RESEARCH_DELAY_SECONDS = 0

# --- Vision Fallback ---
MAX_VISION_PAGES = 15
VISION_BATCH_SIZE = 5

# --- Paths ---
INPUT_DIR = "input"
OUTPUT_MEMO_PATH = "output/memo.md"
TMP_DIR = ".tmp"

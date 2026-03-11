"""
Shared API helpers: retry logic, Claude calls, Perplexity calls, JSON parsing.
Used by extractor, memo_writer, gap_filler, researcher, and deep_scraper.
"""

import sys
import json
import time
import requests
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import (
    ANTHROPIC_API_KEY,
    LLM_MODEL,
    PERPLEXITY_API_KEY,
    PERPLEXITY_MODEL,
    MAX_RETRIES,
    RETRY_SLEEP_SECONDS,
)


def retry_api_call(fn, label="API", max_retries=MAX_RETRIES, sleep_seconds=RETRY_SLEEP_SECONDS):
    """
    Generic retry wrapper. Calls fn() up to max_retries times.
    Returns the result on success, None on total failure.
    """
    for attempt in range(1, max_retries + 1):
        try:
            return fn()
        except Exception as e:
            print(f"  -> {label} attempt {attempt}/{max_retries} failed: {e}")
            if attempt < max_retries:
                time.sleep(sleep_seconds)
    return None


def call_claude(client, system_prompt: str, user_prompt: str, max_tokens: int = 4096) -> str | None:
    """Call Claude with retry logic. Returns response text or None."""
    def _do_call():
        response = client.messages.create(
            model=LLM_MODEL,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return response.content[0].text

    return retry_api_call(_do_call, label="Claude API")


def search_perplexity(query: str) -> str | None:
    """Run a Perplexity search with retry logic. Returns content or None."""
    url = "https://api.perplexity.ai/chat/completions"
    headers = {
        "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": PERPLEXITY_MODEL,
        "messages": [{"role": "user", "content": query}],
    }

    def _do_search():
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]

    return retry_api_call(_do_search, label="Perplexity")


def try_parse_json(text: str) -> dict | None:
    """Try to parse JSON from LLM response, handling markdown backticks and extra text."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(cleaned[start:end])
            except json.JSONDecodeError:
                pass
    return None

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
    GEMINI_API_KEY,
    GEMINI_MODEL,
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
            print(f"  [retry] {label} attempt {attempt}/{max_retries} failed: {type(e).__name__}: {str(e)[:120]}")
            if attempt < max_retries:
                time.sleep(sleep_seconds)
    return None


def call_claude(client, system_prompt: str, user_prompt: str, max_tokens: int = 4096, stream: bool = False) -> str | None:
    """Call Claude with retry logic. Returns response text or None.
    When stream=True, uses streaming API and prints progress dots.
    """
    if stream:
        def _do_call():
            collected = []
            char_count = 0
            with client.messages.stream(
                model=LLM_MODEL,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            ) as response:
                for text in response.text_stream:
                    collected.append(text)
                    char_count += len(text)
                    if char_count >= 500:
                        print(".", end="", flush=True)
                        char_count = 0
            print()  # newline after dots
            return "".join(collected)

        return retry_api_call(_do_call, label="Claude API (streaming)")
    else:
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


def call_claude_tool_use(client, system_prompt: str, user_prompt: str, tools: list, max_tokens: int = 4096) -> dict | None:
    """Call Claude with tool_use for structured output. Returns parsed tool input dict or None."""
    def _do_call():
        response = client.messages.create(
            model=LLM_MODEL,
            max_tokens=max_tokens,
            system=system_prompt,
            tools=tools,
            tool_choice={"type": "any"},
            messages=[{"role": "user", "content": user_prompt}],
        )
        for block in response.content:
            if block.type == "tool_use":
                return block.input
        return None

    return retry_api_call(_do_call, label="Claude Tool Use")


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


def call_gemini(prompt: str, system: str = "", json_schema: dict = None, thinking_level: str = "none") -> str | None:
    """Call Gemini with retry logic. Returns response text or None.
    If json_schema is provided, requests structured JSON output.
    thinking_level: "none" (disabled), "low", "medium", or "high".
    """
    from google import genai
    from google.genai import types

    thinking_budgets = {"none": 0, "low": 1024, "medium": 4096, "high": 8192}
    budget = thinking_budgets.get(thinking_level, 0)

    client = genai.Client(api_key=GEMINI_API_KEY)

    def _do_call():
        config_kwargs = {}
        if budget > 0:
            config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=budget)
        if system:
            config_kwargs["system_instruction"] = system
        if json_schema is not None:
            config_kwargs["response_mime_type"] = "application/json"
            config_kwargs["response_schema"] = json_schema

        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(**config_kwargs),
        )
        return response.text

    return retry_api_call(_do_call, label="Gemini API")


if __name__ == "__main__":
    result = call_gemini("Say hello in one word")
    print(f"Gemini response: {result}")

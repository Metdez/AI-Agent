"""
Execution: Deep scraper -- finds relevant URLs from research results, scrapes via Firecrawl.
"""

import sys
import re
import requests
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import FIRECRAWL_API_KEY, MAX_SCRAPE_URLS
from execution.api_helpers import retry_api_call

PREFERRED_DOMAINS = [
    "crunchbase.com",
    "linkedin.com",
    "techcrunch.com",
    "bloomberg.com",
    "pitchbook.com",
]


def find_relevant_urls(company_name: str, research_results: dict) -> list[str]:
    """Scan research results for URLs and return the most relevant ones."""
    all_urls = set()

    for key, value in research_results.items():
        if isinstance(value, str):
            urls = re.findall(r'https?://[^\s<>"\')\]]+', value)
            all_urls.update(urls)

    if not all_urls:
        return []

    preferred = []
    others = []

    for url in all_urls:
        is_preferred = False
        for domain in PREFERRED_DOMAINS:
            if domain in url:
                preferred.append(url)
                is_preferred = True
                break
        if not is_preferred:
            others.append(url)

    ranked = preferred + others
    return ranked[:MAX_SCRAPE_URLS]


def scrape_urls(urls: list[str]) -> dict[str, str]:
    """Scrape a list of URLs using Firecrawl. Returns {} on empty input."""
    if not urls:
        return {}

    results = {}

    for url in urls:
        print(f"  -> Scraping: {url}")
        content = _scrape_single(url)
        results[url] = content

    return results


def _scrape_single(url: str) -> str:
    """Scrape a single URL via Firecrawl with retry logic."""
    api_url = "https://api.firecrawl.dev/v1/scrape"
    headers = {
        "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "url": url,
        "formats": ["markdown"],
    }

    def _do_scrape():
        response = requests.post(api_url, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        data = response.json()

        markdown = data.get("data", {}).get("markdown", "")
        if markdown:
            return markdown[:3000]
        else:
            return "Scrape returned no markdown content."

    result = retry_api_call(_do_scrape, label=f"Firecrawl for {url}")
    return result if result is not None else "Scrape failed"


if __name__ == "__main__":
    print("Running deep_scraper smoke test...")
    print("\n--- Testing scrape_urls with empty list ---")
    result = scrape_urls([])
    print(f"Empty result: {result}")

    print("\n--- Testing scrape of firecrawl.dev ---")
    result = scrape_urls(["https://firecrawl.dev"])
    for url, content in result.items():
        print(f"URL: {url}")
        print(f"First 200 chars:\n{content[:200]}")

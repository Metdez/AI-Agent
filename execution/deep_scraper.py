"""
Execution: Deep scraper -- finds relevant URLs from research results, scrapes via Firecrawl.
Scraping runs in parallel for speed.
"""

import sys
import re
import requests
from pathlib import Path
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import FIRECRAWL_API_KEY, MAX_SCRAPE_URLS

PREFERRED_DOMAINS = [
    "crunchbase.com",
    "linkedin.com",
    "techcrunch.com",
    "bloomberg.com",
    "pitchbook.com",
    "sec.gov",
    "gartner.com",
    "forrester.com",
    "cbinsights.com",
]


def find_relevant_urls(company_name: str, research_results: dict) -> list[str]:
    """Scan research results for URLs and return the most relevant ones."""
    all_urls = set()

    for key, value in research_results.items():
        if isinstance(value, str):
            urls = re.findall(r'https?://[^\s<>"\')\]]+', value)
            all_urls.update(urls)

    if not all_urls:
        print("  -> No URLs found in research results")
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

    # Deduplicate by domain — keep first URL per domain
    seen_domains = set()
    deduped = []
    for url in ranked:
        domain = urlparse(url).netloc.lower()
        if domain not in seen_domains:
            seen_domains.add(domain)
            deduped.append(url)

    final = deduped[:MAX_SCRAPE_URLS]
    domains = [urlparse(u).netloc.lower() for u in final]
    print(f"  -> Found {len(all_urls)} URLs, deduped to {len(final)} ({', '.join(domains)})")
    return final


def scrape_urls(urls: list[str]) -> dict[str, str]:
    """Scrape a list of URLs using Firecrawl in parallel. Returns {} on empty input."""
    if not urls:
        return {}

    results = {}

    with ThreadPoolExecutor(max_workers=min(len(urls), MAX_SCRAPE_URLS)) as executor:
        futures = {executor.submit(_scrape_single, url): url for url in urls}
        for future in as_completed(futures):
            url = futures[future]
            try:
                results[url] = future.result()
            except Exception as e:
                print(f"  -> Scrape failed for {url}: {e}")
                results[url] = "Scrape failed"
            print(f"  -> Scraped: {url}")

    return results


def _scrape_single(url: str) -> str:
    """Scrape a single URL via Firecrawl. 15s timeout, no retries."""
    api_url = "https://api.firecrawl.dev/v1/scrape"
    headers = {
        "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "url": url,
        "formats": ["markdown"],
    }

    try:
        response = requests.post(api_url, headers=headers, json=payload, timeout=15)
        response.raise_for_status()
        data = response.json()
        markdown = data.get("data", {}).get("markdown", "")
        return markdown[:2000] if markdown else "Scrape returned no markdown content."
    except Exception as e:
        print(f"  -> Firecrawl failed for {url}: {e}")
        return "Scrape failed"


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

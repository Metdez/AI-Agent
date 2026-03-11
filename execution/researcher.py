"""
Execution: Research waterfall -- Tavily primary search, Perplexity fallback.
Covers 6 research areas for each company.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import TAVILY_API_KEY, MINIMUM_RESEARCH_LENGTH
from execution.api_helpers import search_perplexity, retry_api_call


def run_research(company_info: dict) -> dict:
    """
    Run research across 6 areas using Tavily -> Perplexity waterfall.
    """
    company_name = company_info.get("company_name") or "unknown"
    industry_specific = company_info.get("industry_specific") or company_info.get("industry") or "technology"
    founders = company_info.get("founders") or []

    research_areas = {
        "market_size": f"{industry_specific} market size 2024 2025",
        "market_growth": f"{industry_specific} market growth forecast TAM",
        "competitors": f"{company_name} competitors alternatives",
        "industry_trends": f"{industry_specific} VC investment trends",
    }

    if founders:
        founder_names = " ".join(founders) if isinstance(founders, list) else str(founders)
        research_areas["founder_background"] = f"{founder_names} background experience"

    if company_name and company_name != "unknown":
        research_areas["company_news"] = f"{company_name} news funding announcement"

    results = {}

    for area, query in research_areas.items():
        print(f"  -> Researching: {area}...")
        content, source = _waterfall_search(query)
        results[area] = content
        results[f"{area}_source"] = source
        print(f"    Source: {source} | {len(content)} chars")

    return results


def _waterfall_search(query: str) -> tuple[str, str]:
    """Try Tavily first, fall back to Perplexity if result is too thin."""
    tavily_result = _search_tavily(query)
    if tavily_result and len(tavily_result) >= MINIMUM_RESEARCH_LENGTH:
        return tavily_result, "tavily"

    print(f"    Tavily result too thin ({len(tavily_result or '')} chars), trying Perplexity...")
    perplexity_result = search_perplexity(query)
    if perplexity_result and len(perplexity_result) >= MINIMUM_RESEARCH_LENGTH:
        return perplexity_result, "perplexity"

    if perplexity_result:
        return perplexity_result, "perplexity"
    if tavily_result:
        return tavily_result, "tavily"

    return "No data found -- low confidence.", "none"


def _search_tavily(query: str) -> str | None:
    """Search using Tavily with retry logic."""
    def _do_search():
        from tavily import TavilyClient
        client = TavilyClient(api_key=TAVILY_API_KEY)
        response = client.search(query=query, max_results=5)

        contents = []
        for result in response.get("results", []):
            content = result.get("content", "")
            url = result.get("url", "")
            if content:
                contents.append(f"{content}\nSource: {url}")

        return "\n\n".join(contents) if contents else ""

    return retry_api_call(_do_search, label="Tavily")


if __name__ == "__main__":
    print("Running researcher smoke test (Stripe / fintech)...")
    fake_info = {
        "company_name": "Stripe",
        "industry": "fintech",
        "industry_specific": "fintech payments infrastructure",
        "founders": ["Patrick Collison", "John Collison"],
    }
    results = run_research(fake_info)
    for key, value in results.items():
        if not key.endswith("_source"):
            source = results.get(f"{key}_source", "?")
            print(f"\n--- {key} (source: {source}) ---")
            print(value[:300] + "..." if len(value) > 300 else value)

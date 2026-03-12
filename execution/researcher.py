"""
Execution: Research waterfall -- Tavily primary search, Perplexity fallback.
Covers 9 research areas with fully parallel execution (single batch).
Post-research Gemini summarization pass runs in parallel across all areas.
"""

import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import (
    TAVILY_API_KEY,
    MINIMUM_RESEARCH_LENGTH,
)
from execution.api_helpers import search_perplexity, retry_api_call, call_gemini
from execution.cache import load_cache, save_cache


def run_research(company_info: dict) -> dict:
    """
    Run research across 9 areas using Tavily -> Perplexity waterfall.
    All areas run in a single parallel batch. No priority tiers.
    After research, a Gemini summarization pass runs in parallel for all areas.
    Results are cached by company name (daily expiry).
    """
    company_name = company_info.get("company_name") or "unknown"

    # Check cache first
    cached = load_cache(company_name, "research")
    if cached is not None:
        return cached
    industry_specific = company_info.get("industry_specific") or company_info.get("industry") or "technology"
    founders = company_info.get("founders") or []
    product_short = (company_info.get("product_description") or "")[:80]
    target_customer = company_info.get("target_customer") or ""

    # 9 research areas — tam_sam_som is mandatory, founder/news are conditional
    research_areas = {
        "market_size": f"{company_name} {industry_specific} market size 2024 2025 TAM",
        "market_growth": f"{company_name} {industry_specific} market growth forecast CAGR",
        "competitors": f"{company_name} competitors alternatives {industry_specific} {product_short}",
        "industry_trends": f"{industry_specific} VC investment trends 2025",
        "recent_funding_sector": f"{industry_specific} startup VC funding rounds 2024 2025",
        "technology_trends": f"{industry_specific} technology trends innovation 2025",
        "tam_sam_som": (
            f"{company_name} TAM SAM SOM total addressable market serviceable "
            f"addressable market {industry_specific} {target_customer} market size breakdown billions"
        ),
    }

    # Conditional areas -- skip if company is unknown (no useful context to search)
    if founders and company_name and company_name != "unknown":
        founder_names = " ".join(founders) if isinstance(founders, list) else str(founders)
        research_areas["founder_background"] = f"{founder_names} {company_name} founder background experience"

    if company_name and company_name != "unknown":
        research_areas["company_news"] = f"{company_name} news funding announcement 2024 2025"

    results = {}

    # Run all areas in a single parallel batch (up to 9 areas)
    total_areas = len(research_areas)
    print(f"  -> Researching {total_areas} areas in parallel (Tavily -> Perplexity waterfall)...")
    completed_count = 0
    with ThreadPoolExecutor(max_workers=total_areas) as executor:
        futures = {}
        for area, query in research_areas.items():
            futures[executor.submit(_waterfall_search, query)] = area

        for future in as_completed(futures):
            area = futures[future]
            completed_count += 1
            try:
                content, source = future.result()
            except Exception as e:
                print(f"  -> [{completed_count}/{total_areas}] {area} failed: {type(e).__name__}")
                content = "Research failed -- low confidence."
                source = "none"

            results[area] = content
            results[f"{area}_source"] = source
            print(f"  -> [{completed_count}/{total_areas}] {area}: {source} ({len(content)} chars)")

    # Gemini summarization pass — summarize all areas in parallel
    content_areas = [k for k in results if not k.endswith("_source") and isinstance(results[k], str)]
    total_summaries = len(content_areas)
    print(f"  -> Summarizing {total_summaries} areas with Gemini...")
    summary_count = 0
    with ThreadPoolExecutor(max_workers=total_summaries) as executor:
        summary_futures = {}
        for area in content_areas:
            content = results[area]
            prompt = (
                "Summarize this market research in 2-3 tight sentences for a VC memo. "
                "Prioritize specific numbers, percentages, and named competitors.\n\n"
                f"{content}"
            )
            summary_futures[executor.submit(call_gemini, prompt)] = area

        for future in as_completed(summary_futures):
            area = summary_futures[future]
            summary_count += 1
            try:
                summary = future.result()
                if summary:
                    results[f"{area}_summary"] = summary
                    print(f"  -> [{summary_count}/{total_summaries}] {area}_summary: {len(summary)} chars")
                else:
                    print(f"  -> [{summary_count}/{total_summaries}] {area}_summary: Gemini returned None, skipping")
            except Exception as e:
                print(f"  -> [{summary_count}/{total_summaries}] {area}_summary failed: {type(e).__name__}")

    # Save to cache
    save_cache(company_name, "research", results)

    return results


def _waterfall_search(query: str) -> tuple[str, str]:
    """Try Tavily first, fall back to Perplexity."""
    tavily_result = _search_tavily(query)
    if tavily_result and len(tavily_result) >= MINIMUM_RESEARCH_LENGTH:
        return tavily_result, "tavily"

    perplexity_result = search_perplexity(query)
    if perplexity_result and len(perplexity_result) >= MINIMUM_RESEARCH_LENGTH:
        return perplexity_result, "perplexity"

    # Return best available
    if perplexity_result:
        return perplexity_result, "perplexity"
    if tavily_result:
        return tavily_result, "tavily"

    return "No data found.", "none"


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
        "target_customer": "online businesses and platforms",
    }
    results = run_research(fake_info)
    for key, value in results.items():
        if not key.endswith("_source"):
            source = results.get(f"{key}_source", "?")
            print(f"\n--- {key} (source: {source}) ---")
            print(value[:300] + "..." if len(value) > 300 else value)

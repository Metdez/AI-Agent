"""
Execution: Gap filler -- uses Perplexity to fill missing fields after extraction.
Uses Gemini to refine search queries before each Perplexity call.
Checks _missing_fields list and runs context-enriched queries in parallel.
"""

import sys
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, str(Path(__file__).parent.parent))

from execution.api_helpers import search_perplexity, call_gemini
from execution.cache import load_cache, save_cache
from config import GAP_FILL_MAX_QUERIES


def _refine_query(field: str, company_name: str, industry: str, product_desc: str, fallback_query: str) -> str:
    """Use Gemini (thinking_level=low) to build a precise search query. Falls back to hardcoded template."""
    prompt = (
        f"Write a precise 10-15 word web search query to find {field} "
        f"for this company: {company_name}, {industry}, {product_desc[:100]}. "
        f"Return only the search query string, nothing else."
    )
    refined = call_gemini(prompt, thinking_level="low")
    if refined and refined.strip():
        return refined.strip()
    return fallback_query


def _refined_search(field: str, fallback_query: str, company_name: str, industry: str, product_desc: str) -> str | None:
    """Refine query via Gemini, then search via Perplexity."""
    query = _refine_query(field, company_name, industry, product_desc, fallback_query)
    return search_perplexity(query)


def fill_gaps(company_info: dict) -> dict:
    """
    Check _missing_fields list and fill missing fields via Perplexity searches.
    Uses Gemini to refine each search query before calling Perplexity.
    Results are cached by company name (daily expiry).
    """
    missing = company_info.get("_missing_fields", [])

    if not missing:
        print("  -> No missing fields, no gaps to fill.")
        return company_info

    print(f"  -> {len(missing)} gaps to fill: {', '.join(missing)}")

    # Check cache first
    company_name = company_info.get("company_name") or "unknown startup"
    cached = load_cache(company_name, "gap_fill")
    if cached is not None:
        return cached

    gaps_filled = 0
    industry = company_info.get("industry") or ""
    industry_specific = company_info.get("industry_specific") or industry
    product_desc = company_info.get("product_description") or ""

    # Step 1: company_name query runs first (other queries depend on it)
    if "company_name" in missing:
        raw = company_info.get("raw_response", "")[:200]
        fallback_query = f"startup pitch deck company {raw}"
        query = _refine_query("company_name", "unknown startup", industry, product_desc, fallback_query)
        result = search_perplexity(query)
        if result:
            company_info["company_name_from_perplexity"] = result
            if not company_info.get("company_name"):
                company_info["company_name"] = result.split("\n")[0][:100]
            gaps_filled += 1

    company_name = company_info.get("company_name") or "unknown startup"

    # Step 2: build remaining gap queries with fallback templates
    headquarters = company_info.get("headquarters") or ""
    date_founded = company_info.get("date_founded") or ""
    stage = company_info.get("stage") or ""
    business_model = company_info.get("business_model") or ""
    target_customer = company_info.get("target_customer") or ""

    gap_queries = []

    if "industry" in missing:
        gap_queries.append({
            "flag": "industry",
            "query": f"what industry is {company_name} startup in {product_desc[:100]}",
            "apply": lambda r: _apply_industry(company_info, r),
        })

    if "founders" in missing:
        gap_queries.append({
            "flag": "founders",
            "query": f"{company_name} startup founders CEO {headquarters} founded {date_founded}",
            "apply": lambda r: _apply_founders(company_info, r),
        })

    if "traction" in missing:
        gap_queries.append({
            "flag": "traction",
            "query": f"{company_name} {industry_specific} {stage} revenue users traction metrics {business_model}",
            "apply": lambda r: _apply_traction(company_info, r),
        })

    if "revenue_details" in missing:
        gap_queries.append({
            "flag": "financials",
            "query": f"{company_name} funding rounds revenue valuation {stage} founded {date_founded}",
            "apply": lambda r: _apply_financials(company_info, r),
        })

    if "tam_sam_som" in missing:
        gap_queries.append({
            "flag": "tam",
            "query": f"{industry_specific or 'technology'} total addressable market TAM SAM SOM {target_customer} {business_model}",
            "apply": lambda r: _apply_tam(company_info, r),
        })

    if "tech_details" in missing:
        gap_queries.append({
            "flag": "tech_details",
            "query": f"{company_name} technology stack architecture patents {industry_specific} {product_desc[:50]}",
            "apply": lambda r: _apply_tech_details(company_info, r),
        })

    # Cap at GAP_FILL_MAX_QUERIES
    gap_queries = gap_queries[:GAP_FILL_MAX_QUERIES]

    # Step 3: run remaining queries in parallel (each thread: Gemini refine → Perplexity search)
    if gap_queries:
        total_queries = len(gap_queries)
        completed_count = 0
        with ThreadPoolExecutor(max_workers=total_queries) as executor:
            futures = {
                executor.submit(
                    _refined_search, gq["flag"], gq["query"], company_name, industry, product_desc
                ): gq
                for gq in gap_queries
            }
            for future in as_completed(futures):
                gq = futures[future]
                completed_count += 1
                try:
                    result = future.result()
                except Exception as e:
                    print(f"  -> [{completed_count}/{total_queries}] {gq['flag']} failed: {type(e).__name__}")
                    continue
                if result:
                    gq["apply"](result)
                    gaps_filled += 1
                    print(f"  -> [{completed_count}/{total_queries}] {gq['flag']} filled (Gemini+Perplexity)")
                else:
                    print(f"  -> [{completed_count}/{total_queries}] {gq['flag']} — no data found")

    print(f"  -> {gaps_filled} gap(s) filled via Gemini+Perplexity.")

    # Save to cache
    save_cache(company_name, "gap_fill", company_info)

    return company_info


def _apply_industry(company_info, result):
    company_info["industry_from_perplexity"] = result
    if not company_info.get("industry"):
        company_info["industry"] = result.split("\n")[0][:100]


def _apply_founders(company_info, result):
    company_info["founders_from_perplexity"] = result
    if not company_info.get("founders") or company_info["founders"] == []:
        company_info["founders"] = [result.split("\n")[0][:100]]


def _apply_traction(company_info, result):
    company_info["traction_from_perplexity"] = result
    if not company_info.get("traction"):
        company_info["traction"] = result[:500]


def _apply_financials(company_info, result):
    company_info["financials_from_perplexity"] = result


def _apply_tam(company_info, result):
    company_info["tam_from_perplexity"] = result


def _apply_tech_details(company_info, result):
    company_info["tech_details_from_perplexity"] = result
    if not company_info.get("tech_details"):
        company_info["tech_details"] = result[:500]


if __name__ == "__main__":
    print("Running gap_filler smoke test...")
    fake_info = {
        "company_name": None,
        "industry": None,
        "founders": [],
        "traction": None,
        "tech_details": None,
        "product_description": "AI-powered legal assistant for enterprise teams",
        "raw_response": "We are building the next generation AI-powered legal assistant for enterprise teams",
        "_missing_fields": ["company_name", "industry", "founders", "revenue_details", "tam_sam_som", "tech_details"],
    }
    result = fill_gaps(fake_info)
    print(json.dumps(result, indent=2, default=str))

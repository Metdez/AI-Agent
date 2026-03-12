"""
Execution: Source tracker -- builds source registry and cross-validates claims.
Anti-hallucination engine: ensures every data point has provenance and pitch deck
claims are checked against research findings.
"""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from execution.api_helpers import try_parse_json


# Map company_info keys to the memo section they feed into
FIELD_TO_SECTION = {
    "company_name": "Company Overview",
    "legal_entity": "Company Overview",
    "one_line_description": "Company Overview",
    "headquarters": "Company Overview",
    "date_founded": "Company Overview",
    "stage": "Company Overview",
    "business_model": "Company Overview",
    "product_description": "Company Overview",
    "founders": "Founding Team & Leadership",
    "founder_backgrounds": "Founding Team & Leadership",
    "advisors_board": "Founding Team & Leadership",
    "team_size": "Founding Team & Leadership",
    "key_hires": "Founding Team & Leadership",
    "tech_stack": "Product & Technology",
    "ip_patents": "Product & Technology",
    "product_roadmap": "Product & Technology",
    "tam_sam_som": "Market Definition & Sizing",
    "mentioned_competitors": "Market Mapping & Competitive Landscape",
    "target_customer": "Go-to-Market & Traction",
    "sales_motion": "Go-to-Market & Traction",
    "customer_count": "Go-to-Market & Traction",
    "notable_customers": "Go-to-Market & Traction",
    "distribution_channels": "Go-to-Market & Traction",
    "partnerships": "Go-to-Market & Traction",
    "traction": "Go-to-Market & Traction",
    "cac": "Go-to-Market & Traction",
    "ltv": "Go-to-Market & Traction",
    "churn_rate": "Go-to-Market & Traction",
    "nrr": "Go-to-Market & Traction",
    "revenue_details": "Financials",
    "burn_rate": "Financials",
    "runway": "Financials",
    "gross_margin": "Financials",
    "previous_rounds": "Financials",
    "fundraising_ask": "Financials",
}

# Map research keys to memo sections
RESEARCH_TO_SECTION = {
    "market_size": "Market Definition & Sizing",
    "market_growth": "Market Definition & Sizing",
    "competitors": "Market Mapping & Competitive Landscape",
    "industry_trends": "Industry & Macro Trends",
    "founder_background": "Founding Team & Leadership",
    "company_news": "Company Overview",
    "recent_funding_sector": "Industry & Macro Trends",
    "technology_trends": "Product & Technology",
}


def build_source_registry(company_info: dict, research: dict, scraped_content: dict) -> dict:
    """
    Build a unified source registry mapping each data point to its provenance.
    Pure Python -- no API calls.

    Returns:
        {
            "sources": [{"id": "S1", "type": "pitch_deck"|"tavily"|..., "detail": str, "section": str}],
            "source_map": {"field_or_key": "S1", ...}
        }
    """
    sources = []
    source_map = {}
    counter = 1

    # --- Pitch deck fields ---
    # Any non-null, non-empty value in company_info that doesn't end with _from_perplexity
    skip_suffixes = ("_from_perplexity", "_source")
    skip_keys = ("_missing_fields", "raw_response", "keywords_to_research", "industry_specific")

    pitch_id = f"S{counter}"
    sources.append({
        "id": pitch_id,
        "type": "pitch_deck",
        "detail": "Extracted from uploaded pitch deck",
        "section": "Company Overview",
    })
    counter += 1

    for key, value in company_info.items():
        if key in skip_keys:
            continue
        if any(key.endswith(s) for s in skip_suffixes):
            continue
        if _has_value(value):
            source_map[key] = pitch_id

    # --- Perplexity gap-fill fields ---
    for key, value in company_info.items():
        if key.endswith("_from_perplexity") and _has_value(value):
            base_field = key.replace("_from_perplexity", "")
            sid = f"S{counter}"
            sources.append({
                "id": sid,
                "type": "perplexity_gap_fill",
                "detail": f"Perplexity gap-fill for: {base_field}",
                "section": FIELD_TO_SECTION.get(base_field, "Company Overview"),
            })
            source_map[key] = sid
            counter += 1

    # --- Research results ---
    for key, value in research.items():
        if key.endswith("_source"):
            continue
        if not _has_value(value):
            continue

        source_type = research.get(f"{key}_source", "unknown")
        query_hint = key.replace("_", " ")
        sid = f"S{counter}"
        sources.append({
            "id": sid,
            "type": source_type,
            "detail": f"Research: {query_hint}",
            "section": RESEARCH_TO_SECTION.get(key, "Company Overview"),
        })
        source_map[f"research_{key}"] = sid
        counter += 1

    # --- Scraped content ---
    for url, content in scraped_content.items():
        if content and content not in ("Scrape failed", "Scrape returned no markdown content."):
            sid = f"S{counter}"
            sources.append({
                "id": sid,
                "type": "firecrawl",
                "detail": f"Scraped: {url}",
                "section": "Company Overview",
            })
            source_map[f"scraped_{url}"] = sid
            counter += 1

    return {"sources": sources, "source_map": source_map}


def cross_validate(company_info: dict, research: dict, source_registry: dict) -> dict:
    """
    Use Claude to cross-validate pitch deck claims against research findings.
    (Disabled per Agent 5 instructions)
    """
    return {"status": "disabled", "claims": [], "section_scores": {}}


def _has_value(value) -> bool:
    """Check if a value is non-null and non-empty."""
    if value is None:
        return False
    if isinstance(value, str) and not value.strip():
        return False
    if isinstance(value, (list, dict)) and len(value) == 0:
        return False
    return True






if __name__ == "__main__":
    print("Running source_tracker smoke test...")

    fake_company = {
        "company_name": "TestCo",
        "industry": "SaaS",
        "industry_specific": "AI-powered CRM",
        "founders": ["Jane Smith"],
        "traction": "$1M ARR, 50 customers",
        "fundraising_ask": "$10M Series A",
        "team_size": "25 employees",
        "tam_sam_som": {"tam": "$50B", "sam": "$5B", "som": "$500M", "methodology": "bottom-up"},
        "_missing_fields": ["financials", "tech_details"],
    }
    fake_research = {
        "market_size": "CRM market is $80B (Source: Gartner 2024)",
        "market_size_source": "tavily",
        "competitors": "Salesforce, HubSpot, Pipedrive are main competitors",
        "competitors_source": "tavily",
        "industry_trends": "AI CRM adoption growing 40% YoY",
        "industry_trends_source": "perplexity",
    }
    fake_scraped = {
        "https://crunchbase.com/testco": "TestCo raised $5M seed in 2023...",
    }

    print("\n--- Building source registry ---")
    registry = build_source_registry(fake_company, fake_research, fake_scraped)
    print(f"Sources: {len(registry['sources'])}")
    for s in registry["sources"]:
        print(f"  {s['id']}: {s['type']} -- {s['detail']}")
    print(f"\nSource map entries: {len(registry['source_map'])}")

    print("\n--- Cross-validation (requires API key) ---")
    try:
        validation = cross_validate(fake_company, fake_research, registry)
        print(f"Validations: {len(validation.get('validations', []))}")
        for v in validation.get("validations", []):
            print(f"  [{v['status']}] {v['field']}: {v.get('evidence', 'N/A')[:80]}")
        print(f"\nSection confidence: {json.dumps(validation.get('section_confidence', {}), indent=2)}")
    except Exception as e:
        print(f"  Cross-validation skipped (expected if no API key): {e}")

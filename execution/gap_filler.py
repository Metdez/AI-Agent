"""
Execution: Gap filler -- uses Perplexity to fill missing fields after extraction.
"""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from execution.api_helpers import search_perplexity


def fill_gaps(company_info: dict) -> dict:
    """
    Check confidence_flags and fill missing fields via Perplexity searches.
    """
    flags = company_info.get("confidence_flags", {})

    if all(flags.values()):
        print("  -> All confidence flags True, no gaps to fill.")
        return company_info

    gaps_filled = 0
    company_name = company_info.get("company_name") or "unknown startup"

    if not flags.get("company_name_found", True):
        raw = company_info.get("raw_response", "")[:200]
        query = f"startup pitch deck company {raw}"
        result = search_perplexity(query)
        if result:
            company_info["company_name_from_perplexity"] = result
            if not company_info.get("company_name"):
                company_info["company_name"] = result.split("\n")[0][:100]
            gaps_filled += 1

    company_name = company_info.get("company_name") or "unknown startup"

    if not flags.get("industry_found", True):
        query = f"what industry is {company_name} startup in"
        result = search_perplexity(query)
        if result:
            company_info["industry_from_perplexity"] = result
            if not company_info.get("industry"):
                company_info["industry"] = result.split("\n")[0][:200]
            if not company_info.get("industry_specific"):
                company_info["industry_specific"] = result.split("\n")[0][:200]
            gaps_filled += 1

    if not flags.get("founders_found", True):
        query = f"{company_name} startup founders CEO"
        result = search_perplexity(query)
        if result:
            company_info["founders_from_perplexity"] = result
            if not company_info.get("founders") or company_info["founders"] == []:
                company_info["founders"] = [result.split("\n")[0][:100]]
            gaps_filled += 1

    if not flags.get("traction_found", True):
        query = f"{company_name} revenue users traction metrics"
        result = search_perplexity(query)
        if result:
            company_info["traction_from_perplexity"] = result
            if not company_info.get("traction"):
                company_info["traction"] = result[:500]
            gaps_filled += 1

    print(f"  -> {gaps_filled} gap(s) filled via Perplexity.")
    return company_info



if __name__ == "__main__":
    print("Running gap_filler smoke test...")
    fake_info = {
        "company_name": None,
        "industry": None,
        "founders": [],
        "traction": None,
        "raw_response": "We are building the next generation AI-powered legal assistant for enterprise teams",
        "confidence_flags": {
            "company_name_found": False,
            "industry_found": False,
            "founders_found": True,
            "traction_found": True,
        },
    }
    result = fill_gaps(fake_info)
    print(json.dumps(result, indent=2, default=str))

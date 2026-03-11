"""
Execution: Memo writer -- generates the final VC due diligence memo using Claude.
Includes quality check for low-confidence detection.
"""

import sys
import json
from pathlib import Path
from datetime import date

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import ANTHROPIC_API_KEY, MAX_RESEARCH_CHARS_PER_SECTION
from execution.api_helpers import call_claude


def write_memo(company_info: dict, research: dict, scraped_content: dict) -> str:
    """
    Generate a VC due diligence memo using Claude.
    """
    import anthropic

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    # Trim research values to prevent context overflow
    trimmed_research = {}
    for key, value in research.items():
        if isinstance(value, str):
            trimmed_research[key] = value[:MAX_RESEARCH_CHARS_PER_SECTION]
        else:
            trimmed_research[key] = value

    trimmed_scraped = {}
    for url, content in scraped_content.items():
        trimmed_scraped[url] = content[:MAX_RESEARCH_CHARS_PER_SECTION]

    # Determine confidence level
    flags = company_info.get("confidence_flags", {})
    true_count = sum(1 for v in flags.values() if v)
    total = len(flags) if flags else 4
    if true_count == total:
        confidence_level = "High"
    elif true_count >= total / 2:
        confidence_level = "Medium"
    else:
        confidence_level = "Low"

    company_name = company_info.get("company_name") or "Unknown Company"
    today = date.today().strftime("%B %d, %Y")

    system_prompt = (
        "You are a senior VC analyst. Write precise due diligence memos. "
        "Use only provided data. Flag every unknown explicitly with the marker ⚠️. "
        "Never invent statistics or market numbers."
    )

    user_prompt = f"""Write a complete VC due diligence memo using ONLY the data provided below.

COMPANY INFO:
{json.dumps(company_info, indent=2, default=str)}

RESEARCH RESULTS:
{json.dumps(trimmed_research, indent=2, default=str)}

SCRAPED PAGE CONTENT:
{json.dumps(trimmed_scraped, indent=2, default=str)}

FORMAT -- Use exactly these sections:

# Due Diligence Memo: {company_name}
*Generated: {today} | Data Confidence: {confidence_level}*

## 1. Company Overview
## 2. Product & Technology
## 3. Founders & Team
## 4. Market Size & Growth
## 5. Competitive Landscape
## 6. Traction & Business Model
## 7. Key Risks & Unknowns
## 8. Data Sources Used
## 9. Suggested Next Diligence Questions

RULES:
- Every statistic must cite its source (Tavily / Perplexity / pitch deck)
- For unknown sections, write exactly: "Unknown -- priority question for next founder call"
- Section 8: list every tool used and the query that generated each research piece
- Section 9: minimum 5 specific, non-generic questions based on actual gaps found
- Do NOT invent or hallucinate any numbers, names, or market data"""

    memo_text = call_claude(client, system_prompt, user_prompt, max_tokens=8192)

    if not memo_text:
        memo_text = f"# Due Diligence Memo: {company_name}\n\nMemo generation failed. Please retry.\n"

    # Quality check
    unknown_count = memo_text.lower().count("unknown")
    if unknown_count > 3:
        banner = (
            "---\n"
            "LOW CONFIDENCE MEMO -- Over 3 sections lacked sufficient data. "
            "Recommend additional research before proceeding.\n"
            "---\n\n"
        )
        memo_text = banner + memo_text

    return memo_text


def save_memo(memo_text: str, output_path: str = "output/memo.md") -> None:
    """Save memo text to file, creating directories as needed."""
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(memo_text, encoding="utf-8")
    print(f"  -> Memo saved to {output_path}")



if __name__ == "__main__":
    print("Running memo_writer smoke test...")
    fake_company = {
        "company_name": "TestCo",
        "industry": "SaaS",
        "industry_specific": "AI-powered CRM",
        "founders": ["Jane Smith"],
        "traction": "$1M ARR",
        "confidence_flags": {
            "company_name_found": True,
            "industry_found": True,
            "founders_found": True,
            "traction_found": True,
        },
    }
    fake_research = {
        "market_size": "CRM market is $80B (Source: Gartner 2024)",
        "market_size_source": "tavily",
        "competitors": "Salesforce, HubSpot, Pipedrive",
        "competitors_source": "tavily",
    }
    fake_scraped = {}

    memo = write_memo(fake_company, fake_research, fake_scraped)
    print(f"\nMemo length: {len(memo)} chars")
    print(f"First 500 chars:\n{memo[:500]}")

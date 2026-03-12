"""
Execution: Memo writer -- generates the final VC due diligence memo using Gemini.
Single-pass generation of a 10-section investment memo written in the voice of
a senior VC analyst. No inline citations, no confidence banners, no multi-pass.
"""

import sys
import json
from pathlib import Path
from datetime import date

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import (
    MAX_RESEARCH_CHARS_PER_SECTION,
    MEMO_MAX_TOKENS,
)
from execution.api_helpers import call_gemini


def write_memo(company_info: dict, research: dict, scraped_content: dict) -> str:
    """
    Generate a VC due diligence memo using Gemini.
    Single-pass: one Gemini call produces the final 10-section memo.
    """

    # --- 1. Summarize oversized research ---
    trimmed_research = _summarize_research(research)

    trimmed_scraped = {}
    for url, content in scraped_content.items():
        trimmed_scraped[url] = content[:MAX_RESEARCH_CHARS_PER_SECTION]

    company_name = company_info.get("company_name", "Unknown Company")
    today = date.today().strftime("%B %d, %Y")

    # --- 2. Build the sources list ---
    sources = _build_sources_list(company_info, research, scraped_content)
    sources_text = "\n".join(f"{i+1}. {s}" for i, s in enumerate(sources))

    # --- 3. Single-pass memo generation ---
    summary_count = sum(1 for k in research if k.endswith("_summary") and research[k])
    research_areas = sum(1 for k in trimmed_research if not k.startswith("_"))
    truncated_count = research_areas - summary_count
    print(f"  -> Research: {research_areas} areas ({summary_count} with Gemini summaries, {truncated_count} truncated)")
    print(f"  -> Scraped content: {len(trimmed_scraped)} pages included")
    print(f"  -> Sources: {len(sources)} total")
    from config import GEMINI_MODEL
    print(f"  -> Generating memo via {GEMINI_MODEL}...")
    system_prompt = (
        "You are a senior VC analyst at a top-tier venture fund. Write with authority. "
        "Be specific — use numbers, names, dates. Don't pad with generic observations. "
        "If you don't have data on something, say so in one sentence and move on. "
        "Never use phrases like 'it is worth noting', 'it should be noted', 'interestingly', "
        "'notably', 'in conclusion'. Write like you're briefing a partner before an IC meeting. "
        "Be concise. Each memo section should be 3-5 sentences unless data demands more. Do not pad."
    )

    user_prompt = f"""Write a polished investment memo using ONLY the data below.

COMPANY INFO (from pitch deck):
{json.dumps(company_info, indent=2, default=str)}

RESEARCH RESULTS:
{json.dumps(trimmed_research, indent=2, default=str)}

SCRAPED PAGE CONTENT:
{json.dumps(trimmed_scraped, indent=2, default=str)}

Write exactly these 10 sections, in this order:

# Investment Memo: {company_name}
*Prepared {today}*

## 1. Company Overview
What the company does, when it was founded, where it's based, current stage. Direct and factual. 3-5 sentences.

## 2. Founding Team
Who the founders are, their backgrounds, relevant experience. If founder info wasn't disclosed, say so plainly.

## 3. Product & Technology
What they've built, how it works, what the technical differentiation is. Be specific about the product, not generic about the space.

## 4. Market Definition & Sizing
You MUST include TAM, SAM, and SOM figures in this section. If exact numbers are unavailable, provide ranges with sources. How the market is defined. Whether the sizing methodology is credible. If the deck claims a number, note the source.

## 5. Market Mapping & Competitive Landscape
Who the competitors are. How this company positions itself. What the actual differentiation is vs. marketing claims.

## 6. Industry & Macro Trends
Relevant tailwinds or headwinds. Regulatory considerations if material. Keep it to what actually affects this company.

## 7. Go-to-Market & Traction
How they sell, to whom, current metrics. Be precise about what's claimed vs. verified. If revenue figures were not disclosed, say so plainly.

## 8. Financials
Revenue, burn, runway, fundraising history. State what's known and what's missing. Don't invent numbers.

## 9. Risks & Open Questions
The real risks, not generic startup risks. Frame as specific questions that need answers in diligence.

## 10. Investment Thesis
The bull case and the bear case. What has to be true for this to be a great investment. Your honest assessment.

---
## Sources
{sources_text}

RULES:
1. Write in natural prose. This should read like a human analyst wrote it.
2. Be direct and opinionated. Take positions where the data supports them.
3. When data is missing, say so plainly (e.g., "Revenue figures were not disclosed") — don't use markers like [NO DATA] or [UNVERIFIED].
4. When sources conflict, note it naturally (e.g., "The deck claims $5M ARR, though public sources suggest closer to $3M").
5. NO inline citations like [S1], [S2] anywhere in the body.
6. End with the exact Sources list provided above.
7. The tone should be: "I researched this company, here's what I found and what I think" — confident, analytical, occasionally skeptical."""

    memo_text = call_gemini(prompt=user_prompt, system=system_prompt)

    if not memo_text:
        memo_text = f"# Investment Memo: {company_name}\n\nMemo generation failed. Please retry.\n"

    return memo_text


def _build_sources_list(company_info: dict, research: dict, scraped_content: dict) -> list[str]:
    """Build a list of all data sources used, without using source_tracker."""
    sources = []

    # 1. Pitch deck
    if company_info:
        sources.append("Company Pitch Deck (Extracted Data)")

    # 2. Research sources
    research_attribs = set()
    for key, value in research.items():
        if key.endswith("_source") and isinstance(value, str):
            source_name = value.title()
            if source_name == "Tavily":
                source_name = "Tavily Web Search"
            elif source_name == "Perplexity":
                source_name = "Perplexity AI Search"
            research_attribs.add(source_name)

    for attrib in sorted(research_attribs):
        sources.append(attrib)

    # 3. Scraped pages
    for url in scraped_content.keys():
        sources.append(f"Scraped Web Page ({url})")

    if not sources:
        sources.append("No specific sources provided.")

    return sources


def save_memo(memo_text: str, output_path: str = "output/memo.md") -> None:
    """Save memo text to file, creating directories as needed."""
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(memo_text, encoding="utf-8")
    print(f"  -> Memo saved to {output_path}")


def _summarize_research(research: dict) -> dict:
    """
    Summarize research sections for memo input.
    Prefers Gemini pre-summaries ("{area}_summary" keys) when available.
    Falls back to intelligent truncation if no summary exists.
    """
    summarized = {}

    for key, value in research.items():
        if key.startswith("_") or key.endswith("_source") or key.endswith("_summary"):
            continue
        if not isinstance(value, str):
            summarized[key] = value
            continue

        # Prefer Gemini pre-summary if available
        summary_key = f"{key}_summary"
        if summary_key in research and research[summary_key]:
            summarized[key] = research[summary_key]
            continue

        # Fallback: intelligent truncation
        if len(value) <= MAX_RESEARCH_CHARS_PER_SECTION:
            summarized[key] = value
        else:
            truncated = value[:MAX_RESEARCH_CHARS_PER_SECTION]
            last_period = truncated.rfind(".")
            if last_period > MAX_RESEARCH_CHARS_PER_SECTION // 2:
                summarized[key] = truncated[:last_period + 1] + " [Truncated...]"
            else:
                summarized[key] = truncated + "... [Truncated]"

    return summarized


if __name__ == "__main__":
    print("Running memo_writer smoke test...")
    fake_company = {
        "company_name": "TestCo",
        "industry": "SaaS",
        "one_line_description": "AI-powered CRM for enterprise sales teams",
        "stage": "Series A",
        "traction": "$1M ARR, 50 enterprise customers",
        "_missing_fields": ["tech_details"],
    }
    fake_research = {
        "market_size": "CRM market is $80B (Source: Gartner 2024)",
        "market_size_source": "tavily",
        "competitors": "Salesforce, HubSpot, Pipedrive are main competitors",
        "competitors_source": "tavily",
    }
    fake_scraped = {"https://testco.com/about": "We are TestCo, building the future of CRM."}

    memo = write_memo(fake_company, fake_research, fake_scraped)
    print(f"\nMemo length: {len(memo)} chars")
    print(f"First 500 chars:\n{memo[:500]}")

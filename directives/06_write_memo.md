# Directive: Write Due Diligence Memo

## Goal
Generate a structured initial diligence memo that helps partners decide whether to spend more time on a company. The memo should synthesize deck claims, verified facts, and open questions into a clear narrative with a recommendation. Single-pass generation, calm investor tone, no fluff, no inline citations — clean Sources list at the end.

## Inputs
- Company info from `.tmp/company_info.json`
- Research results from `.tmp/research_results.json`
- Scraped content from `.tmp/scraped_content.json`

## Execution Scripts
- `execution/memo_writer.py` — summarizes research, generates the decision memo

## Process
1. Load all input files from `.tmp/`
2. **Summarize research**: Each section capped at 1500 chars. Sections exceeding the limit are truncated at the nearest sentence boundary (no Claude summarization calls needed).
3. **Build sources list**: Pure Python — collects pitch deck, research engine attributions, and scraped URLs into a numbered list. No dependency on source_tracker.
4. **Single-pass memo generation** (1 Gemini call):
   - System prompt establishes the voice: a senior VC associate writing for partners, calm and credible.
   - User prompt contains all data (company_info, summarized research, scraped content) and enforces the 10-section structure.
   - Gemini produces a decision-oriented memo in one shot.
5. Save memo to `output/memo.md`

## Tone & Style
The memo should read like a trusted advisor, not a prosecutor:
- Use caveated language: "Based on available information...", "The deck presents..."
- Distinguish deck claims from verified facts from hypotheses from open questions.
- Never sound accusatory, dramatic, or emotionally charged.
- Replace aggressive phrases ("vaporware," "black holes," "marketing speak alert") with calm, precise language ("product capability remains unverified," "business model details are not yet disclosed").
- Never guess precise numbers without evidence. Instead: "revenue magnitude cannot be determined."
- Frame inferences as hypotheses with explicit evidence basis.
- Frame risks as risk statements, not binary pass/fail gates.
- If the only input is a pitch deck, the memo should contain more questions than answers.

## Required Sections (8)
```
# Initial Diligence Memo: {Company Name}
*Date: {date} | Source: Pitch deck & automated research | Confidence: Low–moderate*

## Executive Summary
## Company Overview
## Why This Could Matter
## What We Know
## Key Diligence Issues
## Early Investment View
## Recommendation
## Next Diligence Steps

---
## Sources
```

## Sources Section
The memo ends with a clean numbered list of all data sources used:
- Company Pitch Deck (Extracted Data)
- Tavily Web Search
- Perplexity AI Search
- Scraped Web Pages with URLs

No inline citation tags (`[S1]`, `[S2]`, etc.) appear anywhere in the body.

## Handling Unknowns & Conflicts
- Key unknowns are framed as "Key Diligence Issues" — professional, decision-oriented.
- Missing metrics are compressed into a tight "Core data gaps" list (one line per gap, not a paragraph).
- Data derived from the deck must be treated as a "claim" unless verified by independent research.

## Outputs
- Final memo saved to `output/memo.md`
- Word count logged to console

## Edge Cases
- **Gemini API failure**: 3 retries with 0.5s sleep. On total failure, write error memo.
- **Context overflow**: Research summarized (truncated to 800 chars/section) to fit within limits.

## Dependencies
- google-genai SDK
- API key: GEMINI_API_KEY

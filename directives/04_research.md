# Directive: Run Research

## Goal
Research the company across 6 areas using a Tavily -> Perplexity waterfall.

## Inputs
- Company info dict from `.tmp/company_info.json`

## Execution Scripts
- `execution/researcher.py` — Tavily primary search with Perplexity fallback

## Process
1. Load company info from `.tmp/company_info.json`
2. Build queries for 6 research areas:
   - `market_size` -> "{industry_specific} market size 2024 2025"
   - `market_growth` -> "{industry_specific} market growth forecast TAM"
   - `competitors` -> "{company_name} competitors alternatives"
   - `industry_trends` -> "{industry_specific} VC investment trends"
   - `founder_background` -> "{founders} background experience" (skip if empty)
   - `company_news` -> "{company_name} news funding announcement" (skip if null)
3. For each area, run the waterfall:
   - Try Tavily (max_results=5), join content fields
   - If result < MINIMUM_RESEARCH_LENGTH (300 chars) -> try Perplexity
   - If both fail -> store "No data found -- low confidence."
4. Each result gets a `{key}_source` key noting "tavily", "perplexity", or "none"
5. Save results to `.tmp/research_results.json`

## Outputs
- Research dict with 6 areas + source attribution
- Per-area source and character count logged to console

## Edge Cases
- **Tavily returns thin results**: Auto-escalate to Perplexity (this is the core waterfall).
- **Rate limit hit**: 3 retries with 2s exponential backoff.
- **Company too new/obscure**: "No data found" stored, memo flags it explicitly.
- **Search terms too generic**: Extractor provides `keywords_to_research` for specificity.

## Dependencies
- tavily-python, requests
- API keys: TAVILY_API_KEY, PERPLEXITY_API_KEY

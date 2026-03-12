# Directive: Run Research

## Goal
Research the company across 8 areas using a Tavily -> Perplexity waterfall with fully parallel execution.

## Inputs
- Company info dict from `.tmp/company_info.json`

## Execution Scripts
- `execution/researcher.py` — Tavily primary search with Perplexity fallback, fully parallel

## Process
1. Load company info from `.tmp/company_info.json`
2. Check cache — if cached research exists for this company today, return cached
3. Build queries for 8 research areas:
   - `market_size` -> "{company_name} {industry_specific} market size 2024 2025 TAM"
   - `market_growth` -> "{company_name} {industry_specific} market growth forecast CAGR"
   - `competitors` -> "{company_name} competitors alternatives {industry_specific} {product_short}"
   - `industry_trends` -> "{industry_specific} VC investment trends 2025"
   - `recent_funding_sector` -> "{industry_specific} startup VC funding rounds 2024 2025"
   - `technology_trends` -> "{industry_specific} technology trends innovation 2025"
   - `founder_background` -> "{founders} {company_name} founder background experience" (skip if company unknown)
   - `company_news` -> "{company_name} news funding announcement 2024 2025" (skip if company unknown)
4. Run **all areas in a single parallel batch** using `ThreadPoolExecutor(max_workers=8)`. No batching delays.
5. For each area, run the waterfall:
   - Try Tavily (max_results=5), join content fields
   - If result < MINIMUM_RESEARCH_LENGTH (300 chars) -> try Perplexity
   - Return best available, or "No data found." if both fail
6. Each result gets a `{key}_source` key noting "tavily", "perplexity", or "none"
7. Save to cache and to `.tmp/research_results.json`

### Removed areas (previously 12, now 8)
These 4 areas were cut for speed — they added time without proportional insight for early-stage VC:
- `regulatory_environment` — rarely relevant for early-stage
- `recent_ma_activity` — nice-to-have, not essential
- `buyer_behavior` — too generic, usually useless results
- `comparable_exits` — speculative for early-stage companies

## Outputs
- Research dict with 8 areas + source attribution
- Per-area source and character count logged to console

## Edge Cases
- **Tavily returns thin results**: Auto-escalate to Perplexity fallback.
- **Rate limit hit**: 3 retries with 2s backoff per API call.
- **Company too new/obscure**: Industry-level queries (4 of 8) still return useful data.
- **Cache hit**: Return cached results, no API calls made.

## Dependencies
- tavily-python, requests
- API keys: TAVILY_API_KEY, PERPLEXITY_API_KEY

# Directive: Deep Scrape Relevant URLs

## Goal
Find and deep-scrape the most relevant URLs from research results using Firecrawl.

## Inputs
- Company name (from `.tmp/company_info.json`)
- Research results (from `.tmp/research_results.json`)

## Execution Scripts
- `execution/deep_scraper.py` — finds URLs in research text, scrapes via Firecrawl

## Process
1. Load company info and research results from `.tmp/`
2. Scan all string values in research results for URLs (starts with http)
3. Rank URLs — prefer: Crunchbase, LinkedIn, TechCrunch, company website, Bloomberg
4. Take up to MAX_SCRAPE_URLS (3) URLs
5. For each URL, call Firecrawl API to get markdown content (truncated to 3000 chars)
6. If a URL fails, store "Scrape failed" — do not crash
7. Save results to `.tmp/scraped_content.json`

## Outputs
- Dict mapping URL -> scraped markdown content
- Empty dict `{}` if no URLs found (no API calls made)

## Edge Cases
- **No URLs in research results**: Return {} immediately. No Firecrawl calls.
- **Empty URL list passed**: Return {} immediately. This is by design per CLAUDE.md rule 12.
- **Firecrawl failure on a URL**: Store "Scrape failed" for that URL, continue with others.
- **Rate limits**: 3 retries with 2s sleep per URL.

## Dependencies
- requests
- API key: FIRECRAWL_API_KEY

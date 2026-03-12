# Directive: DD Agent Pipeline Overview

## Goal
End-to-end due diligence research: pitch deck in -> institutional-grade VC memo out.

## Pipeline Steps (in order)

| Step | Directive | Execution Script | API Keys Used |
|------|-----------|-----------------|---------------|
| 1 | `01_read_pitch_deck.md` | `file_router.py`, `pdf_reader.py`, `pptx_reader.py` | None (Anthropic for vision fallback) |
| 2 | `02_extract_company_info.md` | `extractor.py` | Anthropic |
| 3+4+5 | `03_fill_gaps.md` + `04_research.md` + `05_deep_scrape.md` | `gap_filler.py` + `researcher.py` + `deep_scraper.py` | Perplexity, Tavily, Firecrawl (all run in parallel) |
| 6 | `06_write_memo.md` | `memo_writer.py` | Anthropic |

Steps 3, 4, and 5 run in parallel using `ThreadPoolExecutor(max_workers=3)`. Gap-filling modifies company_info while research reads it — separate copies are used to avoid conflicts. Deep scraping uses company name/info directly (does not depend on research results).

## Intermediate Files (all in .tmp/)
- `pitch_text.txt` — raw extracted text from pitch deck
- `company_info.json` — structured company data (~35 fields + `_missing_fields` list)
- `research_results.json` — research from Tavily/Perplexity waterfall (8 areas)
- `scraped_content.json` — deep-scraped page content from Firecrawl

## Caching
Research results, gap-fills, and scraped content are cached in `.tmp/cache/` keyed on company name + date. Re-runs on the same company within the same day skip all API calls for cached steps. Cache invalidates daily.

## Final Output
- `output/memo.md` — 8-section initial diligence memo (Executive Summary, Company Overview, Why This Could Matter, What We Know, Key Diligence Issues, Early Investment View, Recommendation, Next Diligence Steps) plus a clean Sources list at the end. Written in a calm, credible VC associate tone.

## Handling Unknowns
When data is missing, the memo states it in plain language (e.g., "Revenue figures were not disclosed"). When sources conflict, the memo notes both values naturally. A Sources section at the end of the memo lists all data sources used with URLs where available.

## Error Handling
- Each step wraps in try/except with clear error messages
- If a step fails, the orchestrator logs which step failed and why
- No step assumes the previous step gave clean data
- Every API call has 3 retries with 2s sleep
- Research uses Perplexity fallback when Tavily returns thin results

## Running
```bash
python main.py
```
Drop a pitch deck (PDF or PPTX) into `input/` first.

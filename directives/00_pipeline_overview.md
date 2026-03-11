# Directive: DD Agent Pipeline Overview

## Goal
End-to-end due diligence research: pitch deck in -> VC memo out.

## Pipeline Steps (in order)

| Step | Directive | Execution Script | API Keys Used |
|------|-----------|-----------------|---------------|
| 1 | `01_read_pitch_deck.md` | `file_router.py`, `pdf_reader.py`, `pptx_reader.py` | None |
| 2 | `02_extract_company_info.md` | `extractor.py` | Anthropic |
| 3 | `03_fill_gaps.md` | `gap_filler.py` | Perplexity |
| 4 | `04_research.md` | `researcher.py` | Tavily, Perplexity |
| 5 | `05_deep_scrape.md` | `deep_scraper.py` | Firecrawl |
| 6 | `06_write_memo.md` | `memo_writer.py` | Anthropic |

## Intermediate Files (all in .tmp/)
- `pitch_text.txt` — raw extracted text from pitch deck
- `company_info.json` — structured company data + confidence flags
- `research_results.json` — research from Tavily/Perplexity waterfall
- `scraped_content.json` — deep-scraped page content from Firecrawl

## Final Output
- `output/memo.md` — the due diligence memo

## Error Handling
- Each step wraps in try/except with clear error messages
- If a step fails, the orchestrator logs which step failed and why
- No step assumes the previous step gave clean data
- Every API call has 3 retries with 2s sleep

## Running
```bash
python main.py
```
Drop a pitch deck (PDF or PPTX) into `input/` first.

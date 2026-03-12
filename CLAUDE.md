# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Also mirrored in AGENTS.md and GEMINI.md for other AI environments.

## What This Project Does

Local AI agent for VC due diligence. Drop a pitch deck (PDF/PPTX) into `input/` → run `python main.py` → get a formatted memo at `output/memo.md`. No web server, no database, no cloud platform.

Built as a prototype for Glasswing Ventures (contact: Aditya Chaudhry, Head of AI).

## Commands

```bash
# Setup
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
cp .env.example .env            # fill in all 5 keys

# Run full pipeline
python main.py

# Smoke-test individual modules (each has a __main__ block)
python execution/pdf_reader.py
python execution/pptx_reader.py
python execution/extractor.py           # uses Gemini API (structured output)
python execution/gap_filler.py          # uses Gemini API (query refinement) + Perplexity API
python execution/researcher.py          # uses Tavily + Perplexity + Gemini APIs (9 areas + summarization)
python execution/deep_scraper.py        # uses Firecrawl API
python execution/cache.py               # no API keys needed
```

## 3-Layer Architecture

| Layer | Location | Role |
|---|---|---|
| **Directives** | `directives/` | Markdown SOPs defining goals, inputs, tools, outputs, edge cases |
| **Orchestration** | `main.py` | Wires everything: reads directives, calls execution scripts in order, handles errors |
| **Execution** | `execution/` | Deterministic Python scripts for API calls, data processing, file operations |

The separation exists because LLMs are probabilistic but business logic needs to be deterministic. Push complexity into deterministic code; the orchestrator just makes decisions.

**Self-annealing loop:** When something breaks → fix the script → test it → update the directive with what you learned → system is now stronger.

### Data Flow

```
input/ (PDF or PPTX)
  → Step 1:   file_router.route_file() → pdf_reader or pptx_reader
  → .tmp/pitch_text.txt
  → Step 2:   extractor.extract_company_info()             (Gemini structured output, ~35 fields)
  → .tmp/company_info.json
  ┌ Step 3:   gap_filler.fill_gaps()                       (Gemini query refinement + up to 7 Perplexity gap-fills)
  ├ Step 4:   researcher.run_research()                    (9 areas, fully parallel, Tavily→Perplexity waterfall + Gemini summarization)
  ├ Step 5:   deep_scraper.find_relevant_urls() + scrape_urls() (parallel scraping)
  └ (Steps 3, 4 & 5 run in parallel)
  → .tmp/company_info.json (updated) + .tmp/research_results.json + .tmp/scraped_content.json
  → Step 6:   memo_writer.write_memo() + save_memo()    (Gemini generation)
  → output/memo.md
```

## Module Contracts -- Do Not Change These Signatures

```python
# execution/file_router.py
route_file(file_path: str) -> str

# execution/pdf_reader.py
extract_text_from_pdf(pdf_path: str) -> str

# execution/pptx_reader.py
extract_text_from_pptx(file_path: str) -> str

# execution/extractor.py
extract_company_info(pitch_text: str) -> dict

# execution/research_prioritizer.py  (disabled — always returns {})
prioritize_research(company_info: dict) -> dict

# execution/gap_filler.py
fill_gaps(company_info: dict) -> dict

# execution/researcher.py
run_research(company_info: dict) -> dict

# execution/deep_scraper.py
find_relevant_urls(company_name: str, research_results: dict) -> list[str]
scrape_urls(urls: list[str]) -> dict[str, str]

# execution/memo_writer.py
write_memo(company_info: dict, research: dict, scraped_content: dict) -> str
save_memo(memo_text: str, output_path: str = "output/memo.md") -> None

# execution/source_tracker.py  (cross_validate disabled — returns stub)
build_source_registry(company_info: dict, research: dict, scraped_content: dict) -> dict
cross_validate(company_info: dict, research: dict, source_registry: dict) -> dict

# execution/cache.py
load_cache(company_name: str, cache_type: str) -> dict | None
save_cache(company_name: str, cache_type: str, data: dict) -> None
```

If you change any signature, update `main.py` and every caller at the same time.

## API Keys & Config

Five keys required, all loaded from `.env` via `config.py` (validated at import time):
`ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `PERPLEXITY_API_KEY`, `FIRECRAWL_API_KEY`, `GEMINI_API_KEY`

**Never print, log, or expose `.env` contents.**

Key constants in `config.py`:
- `LLM_MODEL = "claude-sonnet-4-5"`, `PERPLEXITY_MODEL = "sonar"`, `GEMINI_MODEL = "gemini-3-flash-preview"`
- `MAX_PDF_CHARS = 30000` -- always truncate pitch text before sending to LLM
- `MAX_RESEARCH_CHARS_PER_SECTION = 800` -- trim all research sections before memo writing
- `MINIMUM_RESEARCH_LENGTH = 300` -- threshold for Tavily→Perplexity fallback
- `GAP_FILL_MAX_QUERIES = 7` -- max parallel Perplexity gap-fill queries
- `MAX_SCRAPE_URLS = 2`, `MAX_RETRIES = 3`, `RETRY_SLEEP_SECONDS = 0.5`
- `MEMO_MAX_TOKENS = 5000` -- for single-pass memo generation
- `RESEARCH_DELAY_SECONDS = 0` -- no delay (all 9 areas run in one batch)
- `RESEARCH_BATCH_SIZE = 9` -- all research areas run in parallel at once
- `MAX_VISION_PAGES = 15` -- cap pages for vision fallback on image-based PDFs
- `VISION_BATCH_SIZE = 5` -- concurrent vision API calls per batch

## Rules

1. **Never modify function signatures** without updating all callers simultaneously.
2. **Every API call must have retry logic** (3 attempts, 0.5s sleep).
3. **If JSON parsing from LLM fails:** retry once with simpler prompt. If it fails again, return fallback dict.
4. **Every execution script must have a `__main__` smoke test** -- do not remove them.
5. **`deep_scraper.scrape_urls([])` must return `{}` immediately** -- no API calls on empty input.
6. **Intermediates go in `.tmp/`.** Deliverables go in `output/`. Both are gitignored and regenerated by `main.py`.
7. **Do not add** a web server, database, dashboard, or authentication layer.
8. **Do not add new dependencies** without adding them to `requirements.txt`.
9. **Check `execution/` before writing new scripts.** Only create new tools if none exist for the task.
10. **Update directives when you learn something new** (API limits, edge cases, better approaches). Don't create or overwrite directives without asking.

## Shared Helpers

`execution/api_helpers.py` contains shared utilities used across modules:
- `retry_api_call(fn, label)` -- generic retry wrapper (3 attempts, 0.5s sleep)
- `call_claude_tool_use(client, system_prompt, user_prompt, tools, max_tokens)` -- Claude API with tool_use for structured output
- `search_perplexity(query)` -- Perplexity API with retry
- `try_parse_json(text)` -- parse JSON from LLM responses (handles backticks, extra text)
- `call_gemini(prompt, system, json_schema, thinking_level)` -- Gemini API with retry, optional structured JSON output, configurable thinking level ("none"/"low"/"medium"/"high")

`execution/cache.py` contains file-based caching:
- `load_cache(company_name, cache_type)` -- load from `.tmp/cache/` if exists today
- `save_cache(company_name, cache_type, data)` -- save to `.tmp/cache/` with date key

## Integration Test Checklist

Before shipping, all 5 must pass:
1. Text-based PDF → clean run, populated 10-section diligence memo
2. PPTX file → clean run, same quality
3. Unsupported file type → clear error, no crash
4. Obscure/unknown company → unknowns stated plainly in memo
5. Sources section at end lists all data sources used

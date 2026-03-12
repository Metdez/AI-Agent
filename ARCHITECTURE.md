# Codebase Architecture

> VC Due Diligence Agent — drop a pitch deck in, get an investment memo out.

---

## Directory Tree

```
vc-due-diligence-agent/
│
├── main.py                        # Orchestrator — runs the 5-step pipeline (with parallelism)
├── config.py                      # Central config — API keys, model names, all constants
├── requirements.txt               # Python dependencies (8 packages)
├── .env.example                   # Template for the 4 required API keys
├── .env                           # Actual API keys (gitignored, never commit)
├── .gitignore                     # Excludes .env, .venv/, .tmp/, output/, __pycache__/
│
├── CLAUDE.md                      # AI agent instructions (Claude Code)
├── AGENTS.md                      # AI agent instructions (generic / Cursor)
├── GEMINI.md                      # AI agent instructions (Gemini)
├── README.md                      # User-facing documentation
├── ARCHITECTURE.md                # ← You are here
│
├── directives/                    # Layer 1: Plain-English SOPs (what to do)
│   ├── 00_pipeline_overview.md    #   Pipeline structure, steps, caching, error handling
│   ├── 01_read_pitch_deck.md      #   PDF/PPTX reading spec
│   ├── 02_extract_company_info.md #   Claude tool_use extraction (~35 fields + _missing_fields)
│   ├── 03_fill_gaps.md            #   Context-enriched Perplexity gap-filling spec
│   ├── 04_research.md             #   Research across 9 areas, fully parallel, 2-step waterfall + Gemini summarization
│   ├── 05_deep_scrape.md          #   URL discovery + Firecrawl scraping spec
│   ├── 06_write_memo.md           #   Single-pass memo generation + summarization spec
│   └── 07_source_tracking.md      #   Source registry (simplified, cross-validation disabled)
│
├── execution/                     # Layer 3: Deterministic Python scripts (doing the work)
│   ├── api_helpers.py             #   Shared: retry logic, Claude/Perplexity wrappers, tool_use, JSON parsing
│   ├── cache.py                   #   File-based daily cache for research, gap-fill, scrape
│   ├── file_router.py             #   Routes PDF/PPTX to correct reader
│   ├── pdf_reader.py              #   PDF text extraction + capped parallel Claude Vision fallback
│   ├── pptx_reader.py             #   PowerPoint text extraction (slides + notes)
│   ├── extractor.py               #   Gemini structured output: extracts ~35 structured fields from pitch text
│   ├── research_prioritizer.py    #   DISABLED: returns {} immediately (no API calls)
│   ├── gap_filler.py              #   Gemini query refinement + Perplexity gap-filling via _missing_fields
│   ├── researcher.py              #   Tavily + Perplexity: 9 areas, fully parallel, 2-step waterfall + Gemini summarization
│   ├── deep_scraper.py            #   URL discovery + parallel Firecrawl scraping (top 2 URLs)
│   ├── source_tracker.py          #   Source provenance registry (cross-validation disabled)
│   └── memo_writer.py             #   Gemini: single-pass 10-section diligence memo (Gemini pre-summaries)
│
├── input/                         # User drops pitch decks here (gitignored)
│   └── *.pdf / *.pptx             #   Supported formats
│
├── output/                        # Final deliverable (gitignored, regenerated)
│   └── memo.md                    #   The 10-section initial diligence memo
│
└── .tmp/                          # Intermediate data (gitignored, regenerated)
    ├── pitch_text.txt             #   Raw text extracted from pitch deck
    ├── company_info.json          #   Structured company data (~35 fields)
    ├── research_results.json      #   Research from 9 areas with source attribution + Gemini summaries
    ├── scraped_content.json       #   Deep-scraped page content from Firecrawl
    └── cache/                     #   Daily caches keyed by company name + date
```

---

## 3-Layer Architecture

| Layer | Location | Role |
|-------|----------|------|
| **Directives** | `directives/` | Markdown SOPs — define goals, inputs, tools, outputs, edge cases |
| **Orchestration** | `main.py` | Decision-making — reads directives, calls scripts in order, handles errors |
| **Execution** | `execution/` | Deterministic Python — API calls, data processing, file operations |

**Why?** LLMs are probabilistic. Business logic needs to be deterministic. Pushing complexity into tested Python scripts means the orchestrator only makes decisions — it doesn't do the work.

---

## Pipeline: Step by Step

```
┌─────────────────────────────────────────────────────────────────────┐
│                         input/ (PDF or PPTX)                        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 1: READ PITCH DECK                                            │
│  file_router.py → pdf_reader.py or pptx_reader.py                  │
│  Vision fallback: capped at 15 pages, batched parallel              │
│  Output: .tmp/pitch_text.txt  (truncated to 30,000 chars)          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 2: EXTRACT COMPANY INFO                                       │
│  extractor.py → Gemini API (native JSON schema output)              │
│  Primary: structured output with EXTRACTION_SCHEMA → parsed dict    │
│  Fallback: fallback dict with all fields defaulted                  │
│  Output: .tmp/company_info.json  (~35 fields + _missing_fields)     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Steps 3+4+5: FILL GAPS + RESEARCH + DEEP SCRAPE  (ALL PARALLEL)   │
│                                                                     │
│  ┌────────────────────┐ ┌────────────────────┐ ┌─────────────────┐ │
│  │ Step 3: gap_filler │ │ Step 4: researcher │ │ Step 5: scraper │ │
│  │ Gemini refine +    │ │ 9 areas, parallel  │ │ URL discovery + │ │
│  │ Perplexity queries │ │ Tavily→Perplexity  │ │ Firecrawl       │ │
│  │                    │ │ + Gemini summaries │ │                 │ │
│  │ Daily cache first  │ │ Daily cache first  │ │ Daily cache     │ │
│  └────────────────────┘ └────────────────────┘ └─────────────────┘ │
│                                                                     │
│  Output: company_info.json + research_results.json +                │
│          scraped_content.json                                       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Step 6: WRITE MEMO                                                 │
│  memo_writer.py → Gemini API (single pass)                         │
│  Uses Gemini pre-summaries, TAM/SAM/SOM explicitly required         │
│  Output: output/memo.md                                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Descriptions

### Root Files

| File | What It Does | Why It Matters |
|------|-------------|----------------|
| **main.py** | Orchestrates the pipeline with parallel execution (Steps 3+4+5 via ThreadPoolExecutor), manages intermediates in `.tmp/`, handles caching, and coordinates error handling. | The single entry point — `python main.py` runs everything. |
| **config.py** | Loads `.env`, validates 5 API keys at import time, defines all constants (model names, token limits, retry settings, batch sizes, file paths). | Every module imports from here. Change a limit or model in one place. |
| **requirements.txt** | Lists 9 Python packages: `anthropic`, `tavily-python`, `pypdf`, `pymupdf`, `python-pptx`, `python-dotenv`, `requests`, `firecrawl-py`, `google-genai`. | `pip install -r requirements.txt` to set up. |
| **.env.example** | Template with placeholder values for `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `PERPLEXITY_API_KEY`, `FIRECRAWL_API_KEY`, `GEMINI_API_KEY`. | Copy to `.env` and fill in real keys. |

### Directives (`directives/`)

These are plain-English SOPs — not code, but reference documents that define how each pipeline step should behave.

| File | What It Defines |
|------|----------------|
| **00_pipeline_overview.md** | Pipeline structure, parallel Steps 3+4+5, intermediate files, caching, error handling, and how to run. |
| **01_read_pitch_deck.md** | PDF/PPTX reading spec, vision fallback behavior. |
| **02_extract_company_info.md** | Claude tool_use extraction spec: all ~35 output fields, `_missing_fields` list, 2-attempt fallback chain (tool_use full → text-based fallback → fallback dict). |
| **03_fill_gaps.md** | Context-enriched Perplexity gap-filling: which query to run for each missing field in `_missing_fields` (now incorporates industry, stage, business model, etc.), daily caching. |
| **04_research.md** | Research across 9 areas (incl. tam_sam_som), fully parallel execution, 2-step Tavily→Perplexity waterfall, Gemini summarization pass, daily caching. |
| **05_deep_scrape.md** | URL discovery from research results, domain ranking, parallel Firecrawl scraping. |
| **06_write_memo.md** | Single-pass 10-section diligence memo, Gemini pre-summaries preferred over truncation, TAM/SAM/SOM explicitly required, concise analyst tone. |
| **07_source_tracking.md** | Source registry (simplified, cross-validation disabled). |

### Execution Scripts (`execution/`)

Each script is deterministic, testable, and has a `__main__` smoke test.

#### api_helpers.py — Shared Utilities

Centralized helpers used by every other execution script.

| Function | What It Does |
|----------|-------------|
| `retry_api_call(fn, label)` | Generic retry wrapper — calls `fn()` up to 3× with 2s sleep between attempts. Returns `None` on total failure. |
| `call_claude(client, system_prompt, user_prompt, max_tokens)` | Wraps `client.messages.create()` with retry logic. Supports streaming mode. Returns response text. |
| `call_claude_tool_use(client, system_prompt, user_prompt, tools, max_tokens)` | Claude API with tool_use for structured output. Forces tool use via `tool_choice={"type": "any"}`, extracts `block.input` from tool_use content block. Returns parsed dict or `None`. |
| `search_perplexity(query)` | POST to `api.perplexity.ai/chat/completions` with retry. Returns response content. |
| `try_parse_json(text)` | Parses JSON from LLM output — strips markdown backticks, finds JSON object boundaries. Returns `dict` or `None`. |
| `call_gemini(prompt, system, json_schema)` | Gemini API with retry logic and optional structured JSON output. Returns response text. |

**Depends on:** `anthropic`, `requests`, `google-genai`, `config`
**Used by:** Every other execution script

---

#### cache.py — File-Based Daily Cache

| Function | What It Does |
|----------|-------------|
| `load_cache(company_name, cache_type) → dict\|None` | Loads from `.tmp/cache/{slug}_{type}_{date}.json`. Returns `None` if no cache found. Skips caching for "unknown" company names. |
| `save_cache(company_name, cache_type, data) → None` | Saves to `.tmp/cache/{slug}_{type}_{date}.json`. Slugifies company name for filesystem safety. |

**Cache types:** `"research"`, `"gap_fill"`, `"scraped"`

**Expiry:** Daily — keyed on today's date, old caches auto-expire when date changes.

**Depends on:** `json`, `pathlib`, `re`, `datetime`
**Used by:** `gap_filler.py`, `researcher.py`; scrape caching handled at `main.py` level

---

#### file_router.py — File Type Dispatcher

| Function | What It Does |
|----------|-------------|
| `route_file(file_path) → str` | Checks file extension, routes to `pdf_reader` (`.pdf`) or `pptx_reader` (`.pptx`/`.ppt`). Raises `ValueError` for unsupported types. |

**Depends on:** `pdf_reader`, `pptx_reader`
**Called by:** `main.py` (Step 1)

---

#### pdf_reader.py — PDF Text Extraction

| Function | What It Does |
|----------|-------------|
| `extract_text_from_pdf(pdf_path) → str` | Extracts text via PyPDF. If result is <100 chars (likely image-based PDF), falls back to Claude Vision. |
| `_vision_fallback(pdf_path) → str` | Capped at `MAX_VISION_PAGES` (15) pages — prints warning if PDF exceeds cap. Pre-renders all pages to base64 PNG via PyMuPDF, then processes in batches of `VISION_BATCH_SIZE` (5) using ThreadPoolExecutor. Preserves page order via indexed list. |

**Depends on:** `pypdf`, `pymupdf` (fitz), `anthropic`, `api_helpers`
**Called by:** `file_router.py`

---

#### pptx_reader.py — PowerPoint Text Extraction

| Function | What It Does |
|----------|-------------|
| `extract_text_from_pptx(file_path) → str` | Extracts text from all slides (shapes + notes). Joins with `\n\n` between slides. Raises `ValueError` if <50 chars. |

**Depends on:** `python-pptx`
**Called by:** `file_router.py`

---

#### extractor.py — Company Info Extraction

| Function | What It Does |
|----------|-------------|
| `extract_company_info(pitch_text) → dict` | Uses Gemini native JSON schema output (`EXTRACTION_SCHEMA`) for structured extraction of ~35 fields. Parses returned JSON via `try_parse_json()`. On failure, returns fallback dict with all missing fields populated. |

**Extraction strategy:**
1. **Primary:** `call_gemini()` with `EXTRACTION_SCHEMA` (JSON schema with ~35 fields) — returns structured JSON directly
2. **Total failure:** Returns `_ALL_FIELD_DEFAULTS` dict with `_missing_fields` populated

**Schema:** `EXTRACTION_SCHEMA` defines all fields using Gemini's JSON schema format (uppercase types: `STRING`, `ARRAY`, `OBJECT`, with `nullable: True` for optional fields). Replaces the previous Claude `EXTRACTION_TOOL` tool_use schema.

**Output:** Dict with fields like `company_name`, `founders`, `industry`, `traction`, `revenue_details`, `tam_sam_som`, `_missing_fields`, etc.

**Missing Fields** (dynamic list):
- Checks if key fields are null/empty: `company_name`, `industry`, `founders`, `traction`, `revenue_details`, `tam_sam_som`, `tech_details`.

**Depends on:** `api_helpers` (`call_gemini`, `try_parse_json`)
**Called by:** `main.py` (Step 2)

---

#### research_prioritizer.py — DISABLED

| Function | What It Does |
|----------|-------------|
| `prioritize_research(company_info) → dict` | Returns `{}` immediately. Previously used Claude to rank research areas — now disabled. All areas run at equal priority. |

**Depends on:** nothing (no API calls)
**Called by:** Not called from `main.py` (disabled)

---

#### gap_filler.py — Data Gap Filling

| Function | What It Does |
|----------|-------------|
| `fill_gaps(company_info) → dict` | Checks the `_missing_fields` list. For each field, uses Gemini (thinking_level="low") to refine the search query, then runs it via Perplexity. Stores results as `{field}_from_perplexity` and updates null fields. Results cached daily via `cache.py`. |

**Query refinement flow (per missing field):**
1. A hardcoded fallback query template is built from available company context
2. Gemini (`call_gemini`, thinking_level="low") refines the query into a precise 10–15 word web search query
3. If Gemini fails, the hardcoded fallback is used
4. The refined (or fallback) query is sent to Perplexity

**Hardcoded fallback query templates:**
| Missing Field | Fallback Query |
|------|-------|
| `"company_name" in list` | `"startup pitch deck company {raw_response[:200]}"` |
| `"industry" in list` | `"what industry is {company_name} startup in {product_desc[:100]}"` |
| `"founders" in list` | `"{company_name} startup founders CEO {headquarters} founded {date_founded}"` |
| `"traction" in list` | `"{company_name} {industry_specific} {stage} revenue users traction metrics {business_model}"` |
| `"revenue_details" in list` | `"{company_name} funding rounds revenue valuation {stage} founded {date_founded}"` |
| `"tam_sam_som" in list` | `"{industry_specific} total addressable market TAM SAM SOM {target_customer} {business_model}"` |
| `"tech_details" in list` | `"{company_name} technology stack architecture patents {industry_specific} {product_desc[:50]}"` |

**Depends on:** `api_helpers` (`search_perplexity`, `call_gemini`), `cache` (`load_cache`, `save_cache`)
**Called by:** `main.py` (Step 3, runs in parallel with Steps 4 and 5)

---

#### researcher.py — Multi-Source Research

| Function | What It Does |
|----------|-------------|
| `run_research(company_info) → dict` | Research across 9 areas. All areas run in a single parallel batch via `ThreadPoolExecutor(max_workers=9)`. No priority tiers. After research, Gemini summarizes each area in parallel. Results cached daily. |
| `_waterfall_search(query) → (str, str)` | 2-step waterfall: Tavily → Perplexity fallback. Returns `(content, source)`. |
| `_search_tavily(query) → str\|None` | Tavily search with retry, joins content + URLs from results. |

**Fully parallel execution:**
- All 9 areas submitted to a single ThreadPoolExecutor
- No batching delays
- Each area runs the 2-step waterfall independently
- After all areas complete, Gemini summarizes each area in parallel (up to 9 concurrent calls)

**9 Research Areas:**
1. `market_size` — TAM/sizing data
2. `market_growth` — CAGR and projections
3. `competitors` — Direct/indirect competition
4. `industry_trends` — VC investment trends
5. `recent_funding_sector` — Sector funding activity
6. `technology_trends` — Tech innovation trends
7. `tam_sam_som` — TAM/SAM/SOM market size breakdown (always runs)
8. `founder_background` — (conditional) Founder experience
9. `company_news` — (conditional) Recent company news

**Removed areas** (cut for speed — low insight value for early-stage VC):
`regulatory_environment`, `recent_ma_activity`, `buyer_behavior`, `comparable_exits`

**Output:** Dict with `{area}: content`, `{area}_source: "tavily"|"perplexity"|"none"`, and `{area}_summary: gemini_summary` for each area.

**Depends on:** `tavily-python`, `api_helpers` (`search_perplexity`, `call_gemini`), `cache`, `config`
**Called by:** `main.py` (Step 4, runs in parallel with Steps 3 and 5)

---

#### deep_scraper.py — URL Discovery & Scraping

| Function | What It Does |
|----------|-------------|
| `find_relevant_urls(company_name, research_results) → list[str]` | Regex-finds URLs in research text, ranks by domain quality (Crunchbase > LinkedIn > TechCrunch > ...), returns top `MAX_SCRAPE_URLS` (2). |
| `scrape_urls(urls) → dict[str, str]` | Scrapes URLs in parallel via ThreadPoolExecutor. Each URL scraped via Firecrawl API (`format: "markdown"`), truncates to 2,000 chars. Returns `{url: content}`. |
| `_scrape_single(url) → str` | Single-URL Firecrawl scrape with 15s timeout. |

**Domain priority:** crunchbase.com → linkedin.com → techcrunch.com → bloomberg.com → pitchbook.com → sec.gov → gartner.com → forrester.com → cbinsights.com → everything else.

**Edge case:** `scrape_urls([])` returns `{}` immediately — no API calls.

**Caching:** Scrape results cached daily at the `main.py` level (where company name is available).

**Depends on:** `requests`, `config`
**Called by:** `main.py` (Step 5)

---

#### source_tracker.py — Source Provenance (Optional)

| Function | What It Does |
|----------|-------------|
| `build_source_registry(company_info, research, scraped_content) → dict` | **No API call.** Tags every data point with its origin: pitch deck, Perplexity gap-fills, research results, scraped content. Returns `{sources: [...], source_map: {...}}`. |
| `cross_validate(company_info, research, source_registry) → dict` | **Disabled.** Returns `{"status": "disabled", "claims": [], "section_scores": {}}`. |

**4 source types:**
1. `pitch_deck` — Fields extracted directly from the deck
2. `perplexity_gap_fill` — Fields filled by Perplexity searches
3. `tavily` / `perplexity` — Research results and their engines
4. `firecrawl` — Deep-scraped web pages

**Depends on:** `api_helpers`
**Called by:** Optional — not called from main pipeline

---

#### memo_writer.py — Memo Generation

| Function | What It Does |
|----------|-------------|
| `write_memo(company_info, research, scraped_content) → str` | Summarizes research (prefers Gemini pre-summaries), builds sources list, generates 10-section diligence memo in a single Gemini call. Prints pre-generation stats (research areas, sources, model). TAM/SAM/SOM explicitly required. Returns final memo text. |
| `save_memo(memo_text, output_path) → None` | Writes memo to file, creates directories as needed. Prints save path. |
| `_summarize_research(research)` | Prefers `{area}_summary` keys (Gemini pre-summaries) when available. Falls back to intelligent truncation if no summary exists. No additional API calls. |
| `_build_sources_list(company_info, research, scraped_content)` | Pure Python — collects pitch deck, research engine attributions, and scraped URLs into a numbered list. No dependency on source_tracker. |

**Single-pass memo generation (1 Gemini call):**
- System prompt: concise, credible VC analyst voice briefing partners. Explicitly demands brevity (3-5 sentences per section).
- User prompt: all data + 10-section structure. TAM/SAM/SOM figures are explicitly required in Market Definition & Sizing.
- No inline citations, no confidence banners, no multi-pass.

**10 Memo Sections:**
1. Company Overview
2. Founding Team
3. Product & Technology
4. Market Definition & Sizing (TAM/SAM/SOM required)
5. Market Mapping & Competitive Landscape
6. Industry & Macro Trends
7. Go-to-Market & Traction
8. Financials
9. Risks & Open Questions
10. Investment Thesis
(+ Sources section at the end)

**Sources:** Clean numbered list at end. No inline `[S1]`/`[S2]` tags in body.

**Depends on:** `api_helpers` (`call_gemini`), `config`
**Called by:** `main.py` (Step 6)

---

## Module Dependency Graph

```
main.py
  ├── config.py
  ├── execution/file_router.py
  │     ├── execution/pdf_reader.py
  │     │     └── execution/api_helpers.py
  │     └── execution/pptx_reader.py
  ├── execution/extractor.py
  │     └── execution/api_helpers.py
  ├── execution/gap_filler.py
  │     ├── execution/api_helpers.py
  │     └── execution/cache.py
  ├── execution/researcher.py
  │     ├── execution/api_helpers.py
  │     └── execution/cache.py
  ├── execution/deep_scraper.py
  │     └── execution/api_helpers.py
  └── execution/memo_writer.py
        └── execution/api_helpers.py

execution/api_helpers.py (shared)
  ├── anthropic          (Claude API)
  ├── requests           (Perplexity API)
  └── google-genai       (Gemini API)
```

---

## API Usage Summary

| API | Used By | Purpose | Calls Per Run |
|-----|---------|---------|---------------|
| **Anthropic (Claude)** | `pdf_reader` (vision fallback) | Vision OCR | 0–1 |
| **Gemini** | `extractor` (structured output), `gap_filler` (query refinement), `researcher` (summarization), `memo_writer` | Pitch deck extraction, query refinement, post-research summarization, memo writing | 2–18 |
| **Perplexity** | `gap_filler`, `researcher` (fallback) | Fill data gaps, fallback research | 0–15 |
| **Tavily** | `researcher` | Primary web search for 9 research areas | 0–9 |
| **Firecrawl** | `deep_scraper` | Deep-scrape top URLs for full page content | 0–2 |

**Caching:** On re-runs with the same company (same day), all research, gap-fill, and scrape API calls are skipped. Only extraction and memo-writing calls are made.

---

## Config Quick Reference

| Constant | Value | Controls |
|----------|-------|----------|
| `LLM_MODEL` | `claude-sonnet-4-5` | Which Claude model to use everywhere |
| `PERPLEXITY_MODEL` | `sonar` | Perplexity model for gap-fill & research fallback |
| `GEMINI_MODEL` | `gemini-3-flash-preview` | Gemini model for call_gemini() |
| `MAX_PDF_CHARS` | `30,000` | Truncate pitch text before sending to Claude |
| `MAX_RESEARCH_CHARS_PER_SECTION` | `800` | Trim research sections before memo |
| `MINIMUM_RESEARCH_LENGTH` | `300` | Tavily result below this triggers Perplexity fallback |
| `MAX_SCRAPE_URLS` | `2` | Max URLs to deep-scrape via Firecrawl |
| `MAX_RETRIES` | `3` | Retry attempts for all API calls |
| `RETRY_SLEEP_SECONDS` | `0.5` | Seconds between retry attempts |
| `MEMO_MAX_TOKENS` | `5,000` | Gemini output token limit for memo generation |
| `RESEARCH_BATCH_SIZE` | `9` | Researcher runs all areas in a single parallel batch |
| `MAX_VISION_PAGES` | `15` | Cap pages for Claude Vision fallback |
| `VISION_BATCH_SIZE` | `5` | Concurrent vision API calls per batch |

---

## Module Contracts (Do Not Change)

These function signatures are locked. If you change one, update `main.py` and every caller simultaneously.

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

---

## Anti-Hallucination: Simplified Defense

1. **Explicit Unknowns** — Missing data stated plainly, contradictions mentioned naturally.
2. **Sources List** — Comprehensive sources section at the end of the memo attributes data to its origin.

---

## Performance Notes

### Expected Step Timings

| Step | Typical Duration | Notes |
|------|-----------------|-------|
| Step 1: Read Pitch Deck | 0.5-2s (text PDF), 15-45s (image PDF with vision) | Vision fallback is the slowest path; capped at 15 pages |
| Step 2: Extract Company Info | 3-8s | Single Gemini structured output call |
| Steps 3+4+5 (parallel) | 8-20s total | Bottleneck is the slowest of the three parallel tasks |
| - Step 3: Gap Fill | 3-10s | Up to 7 Perplexity queries in parallel, Gemini query refinement |
| - Step 4: Research | 5-15s | Up to 9 Tavily+Perplexity waterfall searches in parallel, Gemini summarization |
| - Step 5: Deep Scrape | 2-8s | Up to 2 Firecrawl calls in parallel |
| Step 6: Write Memo | 8-15s | Single Gemini call (5,000 token limit) |
| **Total (cached)** | **~15s** | Only extraction + memo writing (Steps 2 + 6) |
| **Total (cold)** | **25-50s** | All steps, parallel execution of 3+4+5 |

### API Usage by Step

| Step | Claude | Gemini | Perplexity | Tavily | Firecrawl |
|------|--------|--------|------------|--------|-----------|
| Step 1 (Read) | Vision fallback only | - | - | - | - |
| Step 2 (Extract) | - | Structured output | - | - | - |
| Step 3 (Gap Fill) | - | Query refinement | Gap-fill searches | - | - |
| Step 4 (Research) | - | Summarization | Fallback search | Primary search | - |
| Step 5 (Scrape) | - | - | - | - | Page scraping |
| Step 6 (Memo) | - | Memo generation | - | - | - |

### Optimization Decisions

- **Retry sleep reduced to 0.5s** (from 2s) to minimize wasted time on transient failures
- **Research section cap reduced to 800 chars** (from 1,500) to keep Gemini context focused
- **Memo token limit reduced to 5,000** (from 8,000) for faster, more concise output
- **All research areas run in a single parallel batch** -- no sequential batching or delays
- **Steps 3, 4, 5 run fully parallel** via ThreadPoolExecutor -- total time is max(step3, step4, step5)
- **Daily file-based caching** skips all API calls on re-runs for the same company

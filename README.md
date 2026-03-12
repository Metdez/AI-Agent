# VC Due Diligence Agent

**Drop a pitch deck in. Get a full due diligence memo out.**

VC Due Diligence Agent is a local AI pipeline that reads startup pitch decks, researches the company and market across the web, and writes a professional investment memo — automatically. Built to give VC analysts a head start on the hours of manual work that go into evaluating every deal.

---

## How It Works

```
 ┌─────────────┐
 │  Pitch Deck  │   PDF or PPTX — drop it in the input/ folder
 │  (input/)    │
 └──────┬──────┘
        │
        ▼
 ┌──────────────────────────────────────────────────────────┐
 │            VC Due Diligence Agent Pipeline                │
 │                                                          │
 │  1. Read Deck ──► Extract text from PDF/PPTX             │
 │        │                                                  │
 │        ▼                                                  │
 │  2. Extract Info ──► Gemini identifies company, founders, │
 │        │              industry, traction, stage           │
 │        ▼                                                  │
 │  3. Fill Gaps ──► Perplexity searches for missing data    │
 │        │                                                  │
 │        ▼                                                  │
 │  4. Research ──► Tavily + Perplexity investigate market,  │
 │        │          competitors, founders, news             │
 │        ▼                                                  │
 │  5. Deep Scrape ──► Firecrawl pulls content from top URLs │
 │        │              (Crunchbase, TechCrunch, etc.)       │
 │        ▼                                                  │
 │  6. Write Memo ──► Gemini synthesizes everything into a   │
 │                     formatted due diligence memo          │
 └──────────────────────────────────────────────────────────┘
        │
        ▼
 ┌─────────────┐
 │  DD Memo     │   Markdown memo with 10 sections
 │  (output/)   │   and source citations
 └─────────────┘
```

One command. No manual research. No copy-pasting between browser tabs.

---

## What the Memo Includes

The generated memo follows a standardized VC format with **ten sections**:

| # | Section | What's In It |
|---|---------|-------------|
| 1 | **Company Overview** | Name, HQ, stage, one-liner, founding story |
| 2 | **Founding Team** | Backgrounds, prior exits, domain expertise |
| 3 | **Product & Technology** | What they build, how it works, technical differentiation |
| 4 | **Market Definition & Sizing** | TAM/SAM/SOM figures explicitly required |
| 5 | **Market Mapping & Competitive Landscape** | Direct competitors, positioning, moats |
| 6 | **Industry & Macro Trends** | VC investment trends, technology shifts |
| 7 | **Go-to-Market & Traction** | Revenue, users, unit economics, pricing |
| 8 | **Financials** | Funding history, runway, burn rate |
| 9 | **Risks & Open Questions** | Red flags, missing data, concerns |
| 10 | **Investment Thesis** | Summary case for or against investment |

Every statistic cites its source. Every unknown is explicitly flagged.

---

## Key Features

- **Fully automated** — pitch deck in, memo out, one command
- **Multi-format input** — handles PDF (including image-based with OCR) and PPTX
- **Multi-source research** — combines Tavily search, Perplexity AI, and Firecrawl scraping
- **Confidence scoring** — tracks what was found vs. what's missing, surfaces it clearly
- **Self-healing** — every API call retries 3x with backoff; JSON parsing has multi-layer fallbacks
- **Source attribution** — every claim in the memo is traced back to its origin
- **Runs locally** — no cloud platform, no database, no web server, your data stays on your machine
- **Inspectable pipeline** — all intermediate results saved to `.tmp/` for debugging

---

## Quick Start

### Prerequisites

- Python 3.10+
- API keys for: [Gemini](https://aistudio.google.com/), [Anthropic](https://console.anthropic.com/), [Tavily](https://tavily.com/), [Perplexity](https://docs.perplexity.ai/), [Firecrawl](https://firecrawl.dev/)

### Setup

```bash
# Clone the repo
git clone https://github.com/Metdez/VC-Due-Diligence-Agent.git
cd VC-Due-Diligence-Agent

# Create virtual environment
python -m venv .venv

# Activate it
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure API keys
cp .env.example .env
# Open .env and add your 5 API keys
```

### Run

```bash
# Drop a pitch deck (PDF or PPTX) into the input/ folder, then:
python main.py
```

The memo will be saved to `output/memo.md`.

---

## Architecture

VC Due Diligence Agent uses a **3-layer architecture** designed to keep AI unpredictability from breaking business logic:

| Layer | Location | What It Does |
|-------|----------|-------------|
| **Directives** | `directives/` | Plain-English SOPs that define goals, inputs, outputs, and edge cases for each step |
| **Orchestration** | `main.py` | The decision-maker — reads directives, calls scripts in order, routes data between steps |
| **Execution** | `execution/` | Deterministic Python scripts that handle API calls, file I/O, and data processing |

**Why this separation?** LLMs are probabilistic — they give slightly different answers each time. Business logic needs to be repeatable. By isolating AI calls inside deterministic wrappers with retry logic, fallback strategies, and structured output parsing, the pipeline stays reliable even when individual AI responses vary.

### Self-Annealing Loop

When something breaks, the system gets stronger:

```
Error occurs → Fix the script → Test it → Update the directive with what you learned → Deploy
```

Each failure teaches the system something. The directives accumulate institutional knowledge over time.

---

## Pipeline Deep Dive

### Step 1 — Read Pitch Deck
`execution/file_router.py` → `execution/pdf_reader.py` or `execution/pptx_reader.py`

Routes the input file to the right reader based on extension. PDF reader uses PyPDF for text extraction with a Claude Vision fallback (via PyMuPDF) for image-based decks, capped at 15 pages. PPTX reader pulls text from all shapes and slide notes. Output is truncated to 30,000 characters.

### Step 2 — Extract Company Info
`execution/extractor.py`

Sends the pitch text to **Gemini** using native structured JSON output (schema with ~35 fields) to extract company name, industry, founders, traction, fundraising ask, TAM/SAM/SOM, and more. Populates a `_missing_fields` list for any fields that couldn't be found. Falls back to a default dict if the API call fails entirely.

### Step 3 — Fill Data Gaps
`execution/gap_filler.py`

Checks the `_missing_fields` list from Step 2. For each missing field, uses **Gemini** to refine a search query, then runs it via **Perplexity**. Merges results back into the company info. Results are cached daily. Skips entirely if nothing is missing.

### Step 4 — Research
`execution/researcher.py`

Runs searches across 9 areas (market size, market growth, competitors, industry trends, recent funding, technology trends, TAM/SAM/SOM, founder background, company news) fully in parallel. Uses a **waterfall strategy** — tries Tavily first, falls back to Perplexity if results are under 300 characters. **Gemini** then summarizes each area. Results are cached daily.

### Step 5 — Deep Scrape
`execution/deep_scraper.py`

Scans research results for URLs, ranks them by domain quality (Crunchbase > LinkedIn > TechCrunch > Bloomberg > PitchBook > others), takes the top 2, and scrapes full page content via **Firecrawl**. Each page is returned as cleaned markdown, capped at 2,000 characters.

### Step 6 — Write Memo
`execution/memo_writer.py`

Combines all collected data — company info, research results, scraped content — and generates a 10-section diligence memo in a single **Gemini** call. Uses Gemini pre-summaries from Step 4 to keep context focused. TAM/SAM/SOM figures are explicitly required. Missing data is stated plainly.

---

## Tech Stack

| Technology | Role |
|-----------|------|
| **Gemini** (Google) | Company info extraction, query refinement, research summarization, memo writing |
| **Claude** (Anthropic) | Vision OCR fallback for image-based PDFs |
| **Tavily** | Primary web search for market research |
| **Perplexity** | Gap-filling + research fallback |
| **Firecrawl** | Deep web scraping of high-value URLs |
| **PyPDF + PyMuPDF** | PDF text extraction + Vision fallback rendering |
| **python-pptx** | PowerPoint text extraction |
| **Python 3.10+** | Runtime |

---

## Project Structure

```
├── main.py                  # Orchestrator — runs the full pipeline
├── config.py                # API keys, model config, constants
├── requirements.txt         # Python dependencies
├── .env.example             # Template for API keys
├── .gitignore               # Ignores .env, .tmp/, output/, etc.
│
├── directives/              # Plain-English SOPs for each pipeline step
│   ├── 00_pipeline_overview.md
│   ├── 01_read_pitch_deck.md
│   ├── 02_extract_company_info.md
│   ├── 03_fill_gaps.md
│   ├── 04_research.md
│   ├── 05_deep_scrape.md
│   └── 06_write_memo.md
│
├── execution/               # Deterministic Python scripts
│   ├── api_helpers.py       # Shared retry logic, Gemini/Claude/Perplexity wrappers, JSON parsing
│   ├── file_router.py       # Routes files to the correct reader
│   ├── pdf_reader.py        # PDF text extraction + Claude Vision fallback
│   ├── pptx_reader.py       # PowerPoint text extraction
│   ├── extractor.py         # Gemini-powered company info extraction
│   ├── gap_filler.py        # Gemini query refinement + Perplexity gap filling
│   ├── researcher.py        # Tavily + Perplexity waterfall + Gemini summarization
│   ├── deep_scraper.py      # URL discovery + Firecrawl scraping
│   └── memo_writer.py       # Gemini-powered memo generation
│
├── input/                   # Drop pitch decks here (gitignored)
├── output/                  # Final memo lands here (gitignored)
└── .tmp/                    # Intermediate data files (gitignored)
```

---

## Configuration

All configuration lives in `config.py`:

| Constant | Default | Purpose |
|----------|---------|---------|
| `GEMINI_MODEL` | `gemini-3-flash-preview` | Gemini model for extraction, summarization, and memo writing |
| `LLM_MODEL` | `claude-sonnet-4-5` | Claude model for Vision OCR fallback only |
| `PERPLEXITY_MODEL` | `sonar` | Perplexity model for searches |
| `MAX_PDF_CHARS` | `30,000` | Truncate pitch text before sending to LLM |
| `MAX_RESEARCH_CHARS_PER_SECTION` | `800` | Trim research per section before memo writing |
| `MINIMUM_RESEARCH_LENGTH` | `300` | Threshold to trigger Tavily → Perplexity fallback |
| `MAX_SCRAPE_URLS` | `2` | Maximum URLs to scrape per run |
| `MAX_RETRIES` | `3` | Retry attempts for all API calls |
| `RETRY_SLEEP_SECONDS` | `0.5` | Seconds between retries |
| `MEMO_MAX_TOKENS` | `5,000` | Gemini output token limit for memo generation |

---

## Smoke Testing

Each execution script has a `__main__` block for independent testing:

```bash
python execution/pdf_reader.py          # Test PDF reading
python execution/pptx_reader.py         # Test PPTX reading
python execution/extractor.py           # Test Gemini extraction
python execution/gap_filler.py          # Test Gemini query refinement + Perplexity gap-filling
python execution/researcher.py          # Test Tavily + Perplexity research
python execution/deep_scraper.py        # Test Firecrawl scraping
```

---

## Built For

Prototype built for **Glasswing Ventures** — a venture capital firm investing in AI-first companies.

For: **Aditya Chaudhry**, Head of AI

---

*Built by [Zack Hanna](https://github.com/Metdez)* (Hire Me)

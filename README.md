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
 │  2. Extract Info ──► Claude identifies company, founders, │
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
 │  6. Write Memo ──► Claude synthesizes everything into a   │
 │                     formatted due diligence memo          │
 └──────────────────────────────────────────────────────────┘
        │
        ▼
 ┌─────────────┐
 │  DD Memo     │   Markdown memo with 9 sections,
 │  (output/)   │   source citations, and confidence scoring
 └─────────────┘
```

One command. No manual research. No copy-pasting between browser tabs.

---

## What the Memo Includes

The generated memo follows a standardized VC format with **nine sections**:

| # | Section | What's In It |
|---|---------|-------------|
| 1 | **Company Overview** | Name, HQ, stage, one-liner, founding story |
| 2 | **Product & Technology** | What they build, how it works, technical differentiation |
| 3 | **Founders & Team** | Backgrounds, prior exits, domain expertise |
| 4 | **Market Size & Growth** | TAM/SAM/SOM, growth rate, market forecasts |
| 5 | **Competitive Landscape** | Direct competitors, positioning, moats |
| 6 | **Traction & Business Model** | Revenue, users, unit economics, pricing |
| 7 | **Key Risks & Unknowns** | Red flags, missing data, concerns |
| 8 | **Data Sources Used** | Every tool and query that generated each finding |
| 9 | **Suggested Next Questions** | 5+ specific questions for the founder call |

Every statistic cites its source. Every unknown is explicitly flagged. If too many sections lack data, the memo is automatically tagged with a **LOW CONFIDENCE** banner.

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
- API keys for: [Anthropic](https://console.anthropic.com/), [Tavily](https://tavily.com/), [Perplexity](https://docs.perplexity.ai/), [Firecrawl](https://firecrawl.dev/)

### Setup

```bash
# Clone the repo
git clone https://github.com/Metdez/HIRE-ME.git
cd HIRE-ME

# Create virtual environment
python -m venv .venv

# Activate it
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure API keys
cp .env.example .env
# Open .env and add your 4 API keys
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

Routes the input file to the right reader based on extension. PDF reader uses PyPDF for text extraction with an OCR fallback (pdf2image + Tesseract) for image-based decks. PPTX reader pulls text from all shapes and slide notes. Output is truncated to 30,000 characters.

### Step 2 — Extract Company Info
`execution/extractor.py`

Sends the pitch text to **Claude** with a structured prompt asking for 15+ fields (company name, industry, founders, traction, fundraising ask, etc.). Returns a JSON object with **confidence flags** indicating what was successfully extracted vs. what's missing. Has a two-tier retry: full extraction → simplified prompt → fallback dictionary.

### Step 3 — Fill Data Gaps
`execution/gap_filler.py`

Checks the confidence flags from Step 2. For each `false` flag, runs a targeted **Perplexity** search (e.g., "What industry is [company] in?" or "[company] founders CEO"). Merges results back into the company info. Skips entirely if all flags are `true`.

### Step 4 — Research
`execution/researcher.py`

Runs searches across 6 areas: market size, market growth, competitors, industry trends, founder backgrounds, and company news. Uses a **waterfall strategy** — tries Tavily first (5 results per query), falls back to Perplexity if results are under 300 characters. Every result is tagged with its source.

### Step 5 — Deep Scrape
`execution/deep_scraper.py`

Scans research results for URLs, ranks them by domain quality (Crunchbase > LinkedIn > TechCrunch > Bloomberg > PitchBook > others), takes the top 3, and scrapes full page content via **Firecrawl**. Each page is returned as cleaned markdown, capped at 3,000 characters.

### Step 6 — Write Memo
`execution/memo_writer.py`

Combines all collected data — company info, research results, scraped content — and sends it to **Claude** with a detailed prompt specifying the 9-section format, citation requirements, and rules against hallucination. Runs a quality check: if "unknown" appears more than 3 times, prepends a LOW CONFIDENCE warning banner.

---

## Tech Stack

| Technology | Role |
|-----------|------|
| **Claude** (Anthropic) | Company info extraction + memo writing |
| **Tavily** | Primary web search for market research |
| **Perplexity** | Gap-filling + research fallback |
| **Firecrawl** | Deep web scraping of high-value URLs |
| **PyPDF** | PDF text extraction |
| **pdf2image + Tesseract** | OCR fallback for image-based PDFs |
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
│   ├── api_helpers.py       # Shared retry logic, Claude/Perplexity wrappers, JSON parsing
│   ├── file_router.py       # Routes files to the correct reader
│   ├── pdf_reader.py        # PDF text extraction + OCR fallback
│   ├── pptx_reader.py       # PowerPoint text extraction
│   ├── extractor.py         # Claude-powered company info extraction
│   ├── gap_filler.py        # Perplexity-powered data gap filling
│   ├── researcher.py        # Tavily + Perplexity research waterfall
│   ├── deep_scraper.py      # URL discovery + Firecrawl scraping
│   └── memo_writer.py       # Claude-powered memo generation
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
| `LLM_MODEL` | `claude-sonnet-4-5` | Claude model for extraction and writing |
| `PERPLEXITY_MODEL` | `sonar` | Perplexity model for searches |
| `MAX_PDF_CHARS` | `30,000` | Truncate pitch text before sending to LLM |
| `MAX_RESEARCH_CHARS_PER_SECTION` | `2,000` | Trim research per section before memo writing |
| `MINIMUM_RESEARCH_LENGTH` | `300` | Threshold to trigger Tavily → Perplexity fallback |
| `MAX_SCRAPE_URLS` | `3` | Maximum URLs to scrape per run |
| `MAX_RETRIES` | `3` | Retry attempts for all API calls |
| `RETRY_SLEEP_SECONDS` | `2` | Seconds between retries |

---

## Smoke Testing

Each execution script has a `__main__` block for independent testing:

```bash
python execution/pdf_reader.py          # Test PDF reading
python execution/pptx_reader.py         # Test PPTX reading
python execution/extractor.py           # Test Claude extraction
python execution/gap_filler.py          # Test Perplexity gap-filling
python execution/researcher.py          # Test Tavily + Perplexity research
python execution/deep_scraper.py        # Test Firecrawl scraping
```

---

## Built For

Prototype built for **Glasswing Ventures** — a venture capital firm investing in AI-first companies.

Contact: **Aditya Chaudhry**, Head of AI

---

*Built by [Aditya Mehta](https://github.com/Metdez)*

# Directive: LangGraph Research Agent

## Goal

Run a multi-step research agent that gathers live web data (via Tavily AI search + scraping), researches a topic using Claude + web sources, evaluates quality with Haiku, loops if needed, and saves a structured report.

## Inputs

- `topic` (required): The topic to research
- `url` (optional, repeatable): Target URL(s) to scrape directly. Also auto-extracts URLs from the topic text.
- `max-loops` (optional): Maximum research iterations. Default: 3

## Steps

### 1. Run the research agent

```bash
python execution/langgraph_research_agent.py --topic "Your topic here"
```

With a target URL:
```bash
python execution/langgraph_research_agent.py --topic "Competitive analysis of https://www.spreadjam.com/" --max-loops 5
```

Multiple URLs:
```bash
python execution/langgraph_research_agent.py --topic "Compare these" --url https://a.com --url https://b.com
```

### 2. Review the output

Terminal shows live progress with timing for each step:
- **WEB GATHER**: URLs scraped + searches run (parallel)
- **RESEARCH**: Bullet points from web data + Claude's knowledge
- **ANALYZE**: Sufficient/insufficient decision (Haiku — fast)
- **FINAL SUMMARY**: Structured report with citations

### 3. Retrieve the report

Auto-saved to `.tmp/research_<topic>_<timestamp>.md`

## Performance Optimizations

| Optimization | What it does |
|---|---|
| **Parallel web requests** | Scraping + searching run concurrently via ThreadPoolExecutor (6 workers) |
| **Tavily AI search** | AI-optimized search with built-in answer synthesis — better results than DuckDuckGo |
| **Haiku for analyze** | Yes/no decisions use claude-haiku (~1s vs ~3s with Sonnet) |
| **Token limits** | Research: 3,000 tokens, Analyze: 200 tokens, Summary: 4,096 tokens |
| **Scrape caching** | Same URL never scraped twice across loops |
| **DuckDuckGo fallback** | If Tavily key missing or errors, falls back to DuckDuckGo automatically |

## Graph Flow

```
[START] → [Web Gather] → [Research] → [Analyze] → sufficient?
               ↑            (Sonnet)    (Haiku)        |
               └─── need more data ────────────────────┘
                                                       |
                                                 [Summarize] → [END]
                                                  (Sonnet)    (auto-save)
```

## Requirements

- `ANTHROPIC_API_KEY` in `.env` (required)
- `TAVILY_API_KEY` in `.env` (recommended — falls back to DuckDuckGo if missing)
- Python packages: `langgraph`, `langchain-anthropic`, `python-dotenv`, `tavily-python`, `beautifulsoup4`, `requests`, `duckduckgo-search`

## Edge Cases

- **Max loops**: Forces summary after `max-loops` to prevent infinite cycling
- **Scraping failures**: Cached as errors, agent continues with search results
- **Tavily quota**: Free tier = 1,000 searches/month. Falls back to DuckDuckGo if Tavily errors
- **API cost**: ~$0.05-0.20 per run (Haiku for analyze keeps costs low)
- **Large pages**: Scraped content truncated to 5,000 chars

## Learnings

*(Update this section as you use the agent and discover things)*

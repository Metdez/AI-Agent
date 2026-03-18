#!/usr/bin/env python3
"""
langgraph_research_agent.py

A multi-step research agent built with LangGraph and Claude.
Uses Tavily for AI-optimized web search, parallel requests, smart caching,
and Haiku for fast analysis decisions.

Graph flow:
  [START] → [Web Gather] → [Research] → [Analyze] → sufficient?
                                            |            |
                                            └── loop ────┘
                                                         |
                                                   [Summarize] → [END]

Usage:
  python execution/langgraph_research_agent.py --topic "Your research topic"
  python execution/langgraph_research_agent.py --topic "Analyze https://www.spreadjam.com/" --max-loops 5
  python execution/langgraph_research_agent.py --topic "Compare products" --url https://a.com --url https://b.com
"""

import argparse
import io
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal

# Fix Windows terminal Unicode handling
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from tavily import TavilyClient
from typing_extensions import TypedDict


# ── Config ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent.parent
ENV_PATH = SCRIPT_DIR / ".env"
TMP_DIR = SCRIPT_DIR / ".tmp"

RESEARCH_MODEL = "claude-sonnet-4-6"
ANALYZE_MODEL = "claude-haiku-4-5-20251001"  # Fast + cheap for yes/no decisions
MAX_RESEARCH_LOOPS = 3
MAX_RESEARCH_TOKENS = 3000      # Keep research concise
MAX_ANALYZE_TOKENS = 200        # Analyze is just sufficient/insufficient
MAX_SUMMARIZE_TOKENS = 8192     # Summary gets full budget

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

# Runtime caches
_scrape_cache: dict[str, str] = {}
_tavily_client: TavilyClient | None = None


# ── Web Tools ─────────────────────────────────────────────────────────────────

def get_tavily_client() -> TavilyClient | None:
    """Lazy-init Tavily client."""
    global _tavily_client
    if _tavily_client is None:
        key = os.getenv("TAVILY_API_KEY")
        if key:
            _tavily_client = TavilyClient(api_key=key)
    return _tavily_client


def tavily_search(query: str, max_results: int = 5) -> str:
    """Search using Tavily (AI-optimized search). Returns formatted results."""
    client = get_tavily_client()
    if not client:
        return fallback_search(query, max_results)
    # Tavily has a 400-char query limit
    if len(query) > 380:
        query = query[:380]
    try:
        response = client.search(
            query=query,
            max_results=max_results,
            include_answer=True,
            search_depth="advanced",
        )
        parts = []
        if response.get("answer"):
            parts.append(f"**AI Summary:** {response['answer']}")
        for r in response.get("results", []):
            parts.append(f"- **{r['title']}** ({r['url']})\n  {r.get('content', '')[:300]}")
        return f"### Search: {query}\n\n" + "\n\n".join(parts) if parts else f"[No results for: {query}]"
    except Exception as e:
        print(f"  [Tavily error: {e} — falling back to DuckDuckGo]")
        return fallback_search(query, max_results)


def fallback_search(query: str, max_results: int = 5) -> str:
    """Fallback to DuckDuckGo if Tavily is unavailable."""
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        if not results:
            return f"[No results for: {query}]"
        formatted = [f"- **{r['title']}** ({r['href']})\n  {r['body']}" for r in results]
        return f"### Search: {query}\n\n" + "\n\n".join(formatted)
    except Exception as e:
        return f"[Search failed for '{query}': {e}]"


def scrape_url(url: str, max_length: int = 5000) -> str:
    """Scrape a URL with caching. Returns clean text content."""
    if url in _scrape_cache:
        return _scrape_cache[url]
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
        text = re.sub(r"\n{3,}", "\n\n", text)
        if len(text) > max_length:
            text = text[:max_length] + "\n\n[...truncated...]"
        result = f"### Scraped: {url}\n\n{text}"
        _scrape_cache[url] = result
        return result
    except Exception as e:
        result = f"[Failed to scrape {url}: {e}]"
        _scrape_cache[url] = result
        return result


def parallel_gather(tasks: list[dict]) -> list[str]:
    """
    Run multiple web tasks in parallel.
    Each task is {"type": "search"|"scrape", "query"|"url": ...}
    """
    results = []

    def _run(task):
        if task["type"] == "search":
            return tavily_search(task["query"])
        elif task["type"] == "scrape":
            return scrape_url(task["url"])
        return ""

    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(_run, t): t for t in tasks}
        for future in as_completed(futures):
            try:
                results.append(future.result())
            except Exception as e:
                results.append(f"[Task failed: {e}]")
    return results


def extract_urls_from_topic(topic: str) -> list[str]:
    """Pull any URLs mentioned in the topic string."""
    return re.findall(r"https?://[^\s,)\"']+", topic)


# ── State ─────────────────────────────────────────────────────────────────────

class ResearchState(TypedDict):
    """State that flows through the graph."""
    messages: Annotated[list, add_messages]
    topic: str
    target_urls: list[str]
    web_data: str
    research_notes: str
    loop_count: int
    is_sufficient: bool


# ── Node Functions ────────────────────────────────────────────────────────────

def web_gather_node(state: ResearchState) -> dict:
    """
    Node 0: Gather live web data in parallel.
    Loop 0: scrapes target URLs + broad searches.
    Loop 1+: Claude generates targeted gap-filling queries.
    """
    loop = state.get("loop_count", 0)
    topic = state["topic"]
    target_urls = state.get("target_urls", [])
    existing_web_data = state.get("web_data", "")

    t0 = time.time()
    print(f"\n{'='*60}")
    print(f"  WEB GATHER (loop {loop + 1})")
    print(f"{'='*60}")

    tasks = []

    if loop == 0:
        # Scrape all target URLs
        for url in target_urls:
            print(f"  + Scrape: {url}")
            tasks.append({"type": "scrape", "url": url})

        # Use Haiku to generate smart, short search queries from the (potentially long) topic
        llm = ChatAnthropic(model=ANALYZE_MODEL, max_tokens=300)
        response = llm.invoke([
            SystemMessage(content="Generate 4 short web search queries (under 80 chars each) to research this topic. "
                                  "Cover different angles. Output ONLY queries, one per line. No numbering."),
            HumanMessage(content=f"Topic: {topic}"),
        ])
        search_queries = [q.strip() for q in response.content.strip().split("\n") if q.strip()]

        # Also add domain-specific searches
        for url in target_urls:
            domain = re.findall(r"https?://(?:www\.)?([^/]+)", url)
            if domain:
                search_queries.append(f"{domain[0]} reviews competitors pricing")

        for q in search_queries[:5]:
            print(f"  + Search: {q}")
            tasks.append({"type": "search", "query": q})
    else:
        # Claude generates targeted queries to fill gaps
        llm = ChatAnthropic(model=ANALYZE_MODEL, max_tokens=300)
        response = llm.invoke([
            SystemMessage(content="Generate 3 specific web search queries to fill gaps in this research. "
                                  "Output ONLY the queries, one per line. No numbering, no explanation."),
            HumanMessage(content=f"Topic: {topic}\n\nCurrent research:\n{state.get('research_notes', '')[:2000]}"),
        ])
        queries = [q.strip() for q in response.content.strip().split("\n") if q.strip()]
        for q in queries[:3]:
            print(f"  + Search: {q}")
            tasks.append({"type": "search", "query": q})

    # Run everything in parallel
    gathered = parallel_gather(tasks)

    new_web_data = "\n\n---\n\n".join(gathered)
    combined = existing_web_data + "\n\n---\n\n" + new_web_data if existing_web_data else new_web_data

    elapsed = time.time() - t0
    print(f"  Done: {len(gathered)} sources in {elapsed:.1f}s")

    return {
        "messages": [AIMessage(content=f"Web data gathered (loop {loop + 1})")],
        "web_data": combined,
    }


def research_node(state: ResearchState) -> dict:
    """
    Node 1: Analyze web data + Claude's knowledge into structured research notes.
    """
    llm = ChatAnthropic(model=RESEARCH_MODEL, max_tokens=MAX_RESEARCH_TOKENS)
    loop = state.get("loop_count", 0)
    existing_notes = state.get("research_notes", "")
    web_data = state.get("web_data", "")

    t0 = time.time()

    if loop == 0:
        prompt = f"""Research this topic using the web data below AND your own knowledge.
Cross-reference web sources with what you know. Be concise — use bullet points, not paragraphs.

Topic: {state['topic']}

=== LIVE WEB DATA ===
{web_data[:8000]}
=== END WEB DATA ===

Output detailed bullet points. Cite sources (URL or site name) when using web data."""
    else:
        prompt = f"""Previous research was insufficient. Here's what you had (abbreviated):

{existing_notes[:2000]}

NEW web data to fill gaps:

=== NEW WEB DATA ===
{web_data[-4000:]}
=== END WEB DATA ===

Add ONLY new findings. Don't repeat existing points. Be concise. Cite sources.

Topic: {state['topic']}"""

    response = llm.invoke([
        SystemMessage(content="You are a research assistant with web access. Output concise bullet points. "
                              "Distinguish web-sourced facts from your own knowledge. No fluff."),
        HumanMessage(content=prompt),
    ])

    updated_notes = existing_notes + "\n\n" + response.content if existing_notes else response.content
    elapsed = time.time() - t0

    print(f"\n{'='*60}")
    print(f"  RESEARCH (loop {loop + 1}) [{elapsed:.1f}s]")
    print(f"{'='*60}")
    print(response.content[:500] + "..." if len(response.content) > 500 else response.content)

    return {
        "messages": [response],
        "research_notes": updated_notes,
        "loop_count": loop + 1,
    }


def analyze_node(state: ResearchState) -> dict:
    """
    Node 2: Fast yes/no check — is the research sufficient?
    Uses Haiku for speed (~1s vs ~3s with Sonnet).
    """
    loop = state.get("loop_count", 0)
    max_loops = MAX_RESEARCH_LOOPS

    if loop >= max_loops:
        print(f"\n  ANALYZE: Max loops ({max_loops}) reached — proceeding to summary.")
        return {
            "messages": [AIMessage(content="Research sufficient (max loops).")],
            "is_sufficient": True,
        }

    t0 = time.time()
    llm = ChatAnthropic(model=ANALYZE_MODEL, max_tokens=MAX_ANALYZE_TOKENS)

    response = llm.invoke([
        SystemMessage(content="You evaluate research quality. Reply with SUFFICIENT or INSUFFICIENT "
                              "on the first line, then a one-line reason. Nothing else."),
        HumanMessage(content=f"Topic: {state['topic']}\n\nResearch:\n{state['research_notes'][:3000]}\n\n"
                             f"Is this sufficient for a comprehensive report?"),
    ])

    is_sufficient = "SUFFICIENT" in response.content.upper().split("\n")[0]
    elapsed = time.time() - t0

    print(f"\n  ANALYZE [{elapsed:.1f}s]: {'SUFFICIENT' if is_sufficient else 'INSUFFICIENT — looping back'}")
    print(f"  {response.content.strip()}")

    return {
        "messages": [response],
        "is_sufficient": is_sufficient,
    }


def summarize_node(state: ResearchState) -> dict:
    """
    Node 3: Write the final report. Uses full token budget.
    Auto-saves to .tmp/ as markdown.
    """
    t0 = time.time()
    llm = ChatAnthropic(model=RESEARCH_MODEL, max_tokens=MAX_SUMMARIZE_TOKENS)

    response = llm.invoke([
        SystemMessage(content="You are a skilled technical writer. Write clear, well-structured reports. "
                              "Cite sources where applicable."),
        HumanMessage(content=f"""Write a comprehensive summary report based on this research.

Topic: {state['topic']}

Research notes:
{state['research_notes']}

Structure:
1. Overview (2-3 sentences)
2. Key Findings (bullet points with sources)
3. Analysis (nuances, tradeoffs, insights)
4. Conclusion (actionable takeaways)"""),
    ])

    elapsed = time.time() - t0

    # Auto-save to .tmp/
    TMP_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_topic = re.sub(r"[^\w\s-]", "", state["topic"][:50]).strip().replace(" ", "_")
    output_path = TMP_DIR / f"research_{safe_topic}_{timestamp}.md"
    output_path.write_text(response.content, encoding="utf-8")

    print(f"\n{'='*60}")
    print(f"  FINAL SUMMARY [{elapsed:.1f}s]")
    print(f"{'='*60}")
    print(response.content)
    print(f"\n  Saved to: {output_path}")

    return {
        "messages": [response],
    }


# ── Routing ───────────────────────────────────────────────────────────────────

def should_continue_research(state: ResearchState) -> Literal["web_gather", "summarize"]:
    """Conditional edge: loop back for more web data or proceed to summarize."""
    if state.get("is_sufficient", False):
        return "summarize"
    return "web_gather"


# ── Graph Builder ─────────────────────────────────────────────────────────────

def build_research_graph() -> StateGraph:
    """Build and compile the research agent graph."""
    graph = StateGraph(ResearchState)

    graph.add_node("web_gather", web_gather_node)
    graph.add_node("research", research_node)
    graph.add_node("analyze", analyze_node)
    graph.add_node("summarize", summarize_node)

    graph.add_edge(START, "web_gather")
    graph.add_edge("web_gather", "research")
    graph.add_edge("research", "analyze")
    graph.add_conditional_edges(
        "analyze",
        should_continue_research,
        {"web_gather": "web_gather", "summarize": "summarize"},
    )
    graph.add_edge("summarize", END)

    return graph.compile()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="LangGraph research agent with live web search.")
    parser.add_argument("--topic", "-t", required=True, help="The topic to research")
    parser.add_argument("--url", "-u", action="append", default=[], help="Target URL(s) to scrape (repeatable)")
    parser.add_argument("--max-loops", "-m", type=int, default=3, help="Max research loops (default: 3)")
    args = parser.parse_args()

    # Load environment
    if ENV_PATH.exists():
        load_dotenv(ENV_PATH)
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("\n  ANTHROPIC_API_KEY not found in .env")
        sys.exit(1)

    global MAX_RESEARCH_LOOPS
    MAX_RESEARCH_LOOPS = args.max_loops

    target_urls = list(set(args.url + extract_urls_from_topic(args.topic)))

    agent = build_research_graph()

    tavily_status = "Tavily (advanced)" if os.getenv("TAVILY_API_KEY") else "DuckDuckGo (fallback)"

    print(f"\n  Starting research on: {args.topic}")
    print(f"  Target URLs: {target_urls or 'none'}")
    print(f"  Max loops: {MAX_RESEARCH_LOOPS}")
    print(f"  Models: {RESEARCH_MODEL} (research/summary) | {ANALYZE_MODEL} (analyze)")
    print(f"  Search: {tavily_status}")
    print(f"  Parallelism: enabled")

    t_start = time.time()

    result = agent.invoke({
        "messages": [HumanMessage(content=f"Research this topic: {args.topic}")],
        "topic": args.topic,
        "target_urls": target_urls,
        "web_data": "",
        "research_notes": "",
        "loop_count": 0,
        "is_sufficient": False,
    })

    total = time.time() - t_start
    print(f"\n{'='*60}")
    print(f"  DONE — {result['loop_count']} loop(s) in {total:.1f}s")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

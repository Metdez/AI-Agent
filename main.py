"""
Orchestrator (Layer 2): reads directives, calls execution scripts in order,
saves intermediates to .tmp/, handles errors.

Pipeline: Read → Extract → [Gap Fill + Research + Deep Scrape (parallel)] → Write Memo

This is the glue between intent (directives/) and deterministic execution (execution/).
"""

import sys
import json
import copy
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).parent))

from config import MAX_PDF_CHARS, INPUT_DIR, OUTPUT_MEMO_PATH, TMP_DIR


def _ensure_dirs():
    """Create required directories if they don't exist."""
    Path(TMP_DIR).mkdir(exist_ok=True)
    Path(INPUT_DIR).mkdir(exist_ok=True)
    Path("output").mkdir(exist_ok=True)


def _save_tmp(filename: str, data):
    """Save intermediate data to .tmp/"""
    path = Path(TMP_DIR) / filename
    if isinstance(data, str):
        path.write_text(data, encoding="utf-8")
    else:
        path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")


def _load_tmp_json(filename: str) -> dict:
    """Load JSON intermediate from .tmp/"""
    path = Path(TMP_DIR) / filename
    return json.loads(path.read_text(encoding="utf-8"))


def _load_tmp_text(filename: str) -> str:
    """Load text intermediate from .tmp/"""
    path = Path(TMP_DIR) / filename
    return path.read_text(encoding="utf-8")


def main() -> None:
    """
    Orchestrate the full DD pipeline.
    Reads directives, calls execution scripts, saves intermediates to .tmp/.
    """
    current_step = ""

    try:
        _ensure_dirs()
        t0 = time.time()

        step_times = {}

        # ============================================================
        # Step 1: Read Pitch Deck (directive: 01_read_pitch_deck.md)
        # ============================================================
        current_step = "Step 1: Read Pitch Deck"
        step_start = time.time()
        print(f"\n{'='*60}")
        print("  DD Agent -- Due Diligence Research Pipeline")
        print(f"{'='*60}\n")
        print("Step 1: Reading pitch deck...")

        input_path = Path(INPUT_DIR)
        files = [
            f for f in input_path.iterdir()
            if f.suffix.lower() in (".pdf", ".pptx", ".ppt")
        ]

        if not files:
            print("\n  No PDF or PPTX files found in input/.")
            print("  Drop a pitch deck into the input/ folder and run again.")
            return

        target_file = max(files, key=lambda f: f.stat().st_mtime)
        if len(files) > 1:
            print(f"  -> Found {len(files)} files. Using most recent: {target_file.name}")
        else:
            print(f"  -> Found: {target_file.name}")

        file_ext = target_file.suffix.lower()
        reader_type = "PDF reader" if file_ext == ".pdf" else "PPTX reader"
        print(f"  -> Routing to {reader_type}...")

        from execution.file_router import route_file
        text = route_file(str(target_file))

        if len(text) > MAX_PDF_CHARS:
            original_len = len(text)
            text = text[:MAX_PDF_CHARS]
            print(f"  -> Truncated to {MAX_PDF_CHARS:,} chars (was {original_len:,})")

        print(f"  -> {len(text):,} characters extracted")
        _save_tmp("pitch_text.txt", text)
        step_times["Step 1: Read"] = time.time() - step_start
        print(f"  Step 1 complete in {step_times['Step 1: Read']:.1f}s")

        # ============================================================
        # Step 2: Extract Company Info (directive: 02_extract_company_info.md)
        # ============================================================
        current_step = "Step 2: Extract Company Info"
        step_start = time.time()
        print(f"\nStep 2: Extracting company information (Gemini structured output)...")

        from execution.extractor import extract_company_info
        company_info = extract_company_info(text)

        company_name = company_info.get("company_name") or "Unknown"
        industry = company_info.get("industry") or "Unknown"
        stage = company_info.get("stage") or "Unknown"
        missing = company_info.get("_missing_fields", [])
        print(f"  -> Company: {company_name} | Industry: {industry} | Stage: {stage}")
        if missing:
            print(f"  -> Missing fields ({len(missing)}): {', '.join(missing)}")
        _save_tmp("company_info.json", company_info)
        step_times["Step 2: Extract"] = time.time() - step_start
        print(f"  Step 2 complete in {step_times['Step 2: Extract']:.1f}s")



        # ============================================================
        # Steps 3, 4 & 5: Fill Gaps + Research + Deep Scrape (parallel)
        # ============================================================
        current_step = "Steps 3, 4 & 5: Fill Gaps, Research, Deep Scrape (parallel)"
        step_start = time.time()
        print(f"\nSteps 3+4+5: Launching 3 parallel tasks...")
        print(f"  -> Step 3: Gap-fill ({len(missing)} missing fields via Gemini+Perplexity)")
        print(f"  -> Step 4: Research (9 areas via Tavily+Perplexity+Gemini)")
        print(f"  -> Step 5: Deep scrape (URL discovery + Firecrawl)")

        from execution.gap_filler import fill_gaps
        from execution.researcher import run_research
        from execution.deep_scraper import find_relevant_urls, scrape_urls
        from execution.cache import load_cache, save_cache

        company_info_for_gaps = copy.deepcopy(company_info)
        company_info_for_research = copy.deepcopy(company_info)
        company_name_for_scrape = company_info.get("company_name") or "unknown"

        def _do_deep_scrape():
            """Run deep scrape with cache logic. Returns scraped_content dict."""
            cached_scrape = load_cache(company_name_for_scrape, "scraped")
            if cached_scrape is not None:
                return cached_scrape
            
            # Use company name as instructed, sending empty dict for research_results
            urls = find_relevant_urls(company_name_for_scrape, {})
            if urls:
                print(f"  -> Found {len(urls)} relevant URLs")
                result = scrape_urls(urls)
                print(f"  -> Scraped {len(result)} pages")
            else:
                print("  -> No relevant URLs found, skipping.")
                result = {}
                
            save_cache(company_name_for_scrape, "scraped", result)
            return result

        with ThreadPoolExecutor(max_workers=3) as executor:
            gap_future = executor.submit(fill_gaps, company_info_for_gaps)
            research_future = executor.submit(run_research, company_info_for_research)
            scrape_future = executor.submit(_do_deep_scrape)

            company_info = gap_future.result()
            research = research_future.result()
            scraped_content = scrape_future.result()

        gaps_filled = sum(1 for k in company_info if k.endswith("_from_perplexity"))
        research_areas_done = [
            k for k in research if not k.endswith("_source") and not k.endswith("_summary") and not k.startswith("_")
        ]
        summaries_done = sum(1 for k in research if k.endswith("_summary") and research[k])
        tavily_count = sum(1 for k in research if k.endswith("_source") and research[k] == "tavily")
        perplexity_count = sum(1 for k in research if k.endswith("_source") and research[k] == "perplexity")

        print(f"\n  {'─'*50}")
        print(f"  Parallel tasks complete:")
        print(f"    Gap-fill:  {gaps_filled} fields enriched")
        print(f"    Research:  {len(research_areas_done)} areas ({tavily_count} Tavily, {perplexity_count} Perplexity, {summaries_done} Gemini summaries)")
        print(f"    Scrape:    {len(scraped_content)} pages scraped")
        print(f"  {'─'*50}")

        _save_tmp("company_info.json", company_info)
        _save_tmp("research_results.json", research)
        _save_tmp("scraped_content.json", scraped_content)
        step_times["Steps 3+4+5"] = time.time() - step_start
        print(f"  Steps 3+4+5 complete in {step_times['Steps 3+4+5']:.1f}s")

        # ============================================================
        # Step 6: Write Memo (directive: 06_write_memo.md)
        # ============================================================
        current_step = "Step 6: Write Memo"
        step_start = time.time()
        print(f"\nStep 6: Writing due diligence memo (single-pass Gemini)...")

        from execution.memo_writer import write_memo, save_memo

        memo_text = write_memo(company_info, research, scraped_content)

        save_memo(memo_text, OUTPUT_MEMO_PATH)

        word_count = len(memo_text.split())
        section_count = memo_text.count("## ")
        step_times["Step 6: Memo"] = time.time() - step_start
        total_time = time.time() - t0

        print(f"\n{'='*60}")
        print(f"  DONE — Memo saved to {OUTPUT_MEMO_PATH}")
        print(f"{'='*60}")
        print(f"  Company:     {company_name}")
        print(f"  Sections:    {section_count}")
        print(f"  Word count:  {word_count:,}")
        print(f"  {'─'*50}")
        for step_label, duration in step_times.items():
            print(f"  {step_label:<20s} {duration:>5.1f}s")
        print(f"  {'─'*50}")
        print(f"  {'Total pipeline':<20s} {total_time:>5.1f}s")
        print(f"{'='*60}\n")

    except Exception as e:
        print(f"\n[ERROR] Pipeline failed at {current_step}")
        print(f"   Error: {e}")
        raise


if __name__ == "__main__":
    main()

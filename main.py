"""
Orchestrator (Layer 2): reads directives, calls execution scripts in order,
saves intermediates to .tmp/, handles errors.

This is the glue between intent (directives/) and deterministic execution (execution/).
"""

import sys
import json
from pathlib import Path

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

        # ============================================================
        # Step 1: Read Pitch Deck (directive: 01_read_pitch_deck.md)
        # ============================================================
        current_step = "Step 1: Read Pitch Deck"
        print(f"\n{'='*60}")
        print("  DD Agent -- Due Diligence Research Pipeline")
        print(f"{'='*60}\n")
        print("Step 1: Scanning input folder...")

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

        print(f"\n  Reading file: {target_file.name}...")

        from execution.file_router import route_file
        text = route_file(str(target_file))

        if len(text) > MAX_PDF_CHARS:
            original_len = len(text)
            text = text[:MAX_PDF_CHARS]
            print(f"  -> Truncated to {MAX_PDF_CHARS} characters (was {original_len})")

        print(f"  -> {len(text)} characters extracted")
        _save_tmp("pitch_text.txt", text)

        # ============================================================
        # Step 2: Extract Company Info (directive: 02_extract_company_info.md)
        # ============================================================
        current_step = "Step 2: Extract Company Info"
        print(f"\nStep 2: Extracting company information...")

        from execution.extractor import extract_company_info
        pitch_text = _load_tmp_text("pitch_text.txt")
        company_info = extract_company_info(pitch_text)

        company_name = company_info.get("company_name") or "Unknown"
        industry = company_info.get("industry") or "Unknown"
        flags = company_info.get("confidence_flags", {})
        print(f"  -> Company: {company_name}")
        print(f"  -> Industry: {industry}")
        print(f"  -> Confidence flags: {flags}")
        _save_tmp("company_info.json", company_info)

        # ============================================================
        # Step 3: Fill Gaps (directive: 03_fill_gaps.md)
        # ============================================================
        current_step = "Step 3: Fill Data Gaps"
        print(f"\nStep 3: Filling data gaps...")

        from execution.gap_filler import fill_gaps
        company_info = _load_tmp_json("company_info.json")
        company_info = fill_gaps(company_info)
        _save_tmp("company_info.json", company_info)

        # ============================================================
        # Step 4: Research (directive: 04_research.md)
        # ============================================================
        current_step = "Step 4: Run Research"
        print(f"\nStep 4: Running research (Tavily + Perplexity)...")

        from execution.researcher import run_research
        company_info = _load_tmp_json("company_info.json")
        research = run_research(company_info)

        for key, value in research.items():
            if not key.endswith("_source"):
                source = research.get(f"{key}_source", "?")
                print(f"  -> {key}: {source} ({len(value)} chars)")

        _save_tmp("research_results.json", research)

        # ============================================================
        # Step 5: Deep Scrape (directive: 05_deep_scrape.md)
        # ============================================================
        current_step = "Step 5: Deep Scrape"
        print(f"\nStep 5: Deep scraping relevant pages...")

        from execution.deep_scraper import find_relevant_urls, scrape_urls
        company_info = _load_tmp_json("company_info.json")
        research = _load_tmp_json("research_results.json")

        company_name_for_scrape = company_info.get("company_name") or "unknown"
        urls = find_relevant_urls(company_name_for_scrape, research)

        if urls:
            print(f"  -> Found {len(urls)} relevant URLs")
            scraped_content = scrape_urls(urls)
            print(f"  -> Scraped {len(scraped_content)} pages")
        else:
            print("  -> No relevant URLs found, skipping.")
            scraped_content = {}

        _save_tmp("scraped_content.json", scraped_content)

        # ============================================================
        # Step 6: Write Memo (directive: 06_write_memo.md)
        # ============================================================
        current_step = "Step 6: Write Memo"
        print(f"\nStep 6: Writing due diligence memo...")

        from execution.memo_writer import write_memo, save_memo
        company_info = _load_tmp_json("company_info.json")
        research = _load_tmp_json("research_results.json")
        scraped_content = _load_tmp_json("scraped_content.json")

        memo_text = write_memo(company_info, research, scraped_content)

        print(f"\nStep 7: Saving memo...")
        save_memo(memo_text, OUTPUT_MEMO_PATH)

        word_count = len(memo_text.split())
        print(f"\n{'='*60}")
        print(f"  [OK] Done. Memo saved to {OUTPUT_MEMO_PATH}")
        print(f"     Word count: {word_count}")
        print(f"{'='*60}\n")

    except Exception as e:
        print(f"\n[ERROR] Pipeline failed at {current_step}")
        print(f"   Error: {e}")
        raise


if __name__ == "__main__":
    main()

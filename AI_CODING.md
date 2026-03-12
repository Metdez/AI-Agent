# AI Coding Prompts — 2x Pipeline Speedup

> 6 parallel agent prompts. Each agent owns specific files — no conflicts between agents.
> Run all 6 simultaneously. Together they cut runtime ~2x while keeping research quality.
>
> **Goals:** Kill unnecessary steps, maximize parallelism, remove citation/confidence overhead, make the memo read like a human analyst wrote it (not AI).

---

## Agent 1 — Rewrite `main.py` (Pipeline Restructuring)

**Files you own:** `main.py`

**Context:** This is the orchestrator for a VC due diligence pipeline. Currently it runs 8 sequential/semi-parallel steps. The pipeline is too slow. Other agents are simultaneously simplifying the execution scripts — your job is to restructure the pipeline itself.

**Current flow (slow):**
```
Step 1: Read pitch deck (fast, keep)
Step 2: Extract company info via Claude tool_use (keep)
Step 2.5: Research prioritizer — 1 Claude call, ranks 12 areas (DELETE)
Step 3+4: Gap fill + Research (parallel, keep but expand)
Step 5: Deep scrape (currently sequential after 3+4, MOVE into parallel group)
Step 5.5: Source registry build + cross-validation (DELETE cross-validation)
Step 6: Write memo (keep, but it's being simplified by another agent)
```

**Changes to make:**

1. **Delete Step 2.5 entirely.** Remove the `research_prioritizer` import and call. The `company_info` dict will no longer have a `research_priorities` key — that's fine, `researcher.py` is being updated by another agent to not need it.

2. **Run Steps 3, 4, AND 5 all in parallel** using a single `ThreadPoolExecutor(max_workers=3)`. Currently Steps 3+4 run in parallel, finish, THEN Step 5 runs. Deep scraping doesn't depend on gap-fill or research results in practice — it uses the company name and can find URLs from initial extraction. Change `find_relevant_urls()` to use `company_info` fields (company name, industry, website if available) instead of `research_results`. Submit all three as futures and wait for all three.

3. **Delete Step 5.5 (cross-validation).** Remove the `source_tracker` import. Remove the `cross_validate()` call. Remove the code that saves `source_registry.json` and `validation_results.json` to `.tmp/`. Keep `build_source_registry()` ONLY if memo_writer still needs it — but the other agent is removing that dependency too, so just delete the whole step.

4. **Remove all source_tracker references.** No more `_do_source_registry()` helper function or its ThreadPoolExecutor block.

5. **Simplify the Step 5 deep scrape call.** Since it now runs in parallel with research, change the `find_relevant_urls()` call to use `company_name` from `company_info.get("company_name", "unknown")` and pass an empty dict for research_results (or better: just pass `company_info` and let deep_scraper figure out URLs from the company name/website). The other agent working on deep_scraper.py will handle the implementation side.

6. **Remove intermediate file saves that are no longer needed:** `source_registry.json`, `validation_results.json`. Keep saving `company_info.json`, `research_results.json`, `scraped_content.json`, and `pitch_text.txt`.

7. **The final call to `write_memo()` stays the same signature:** `write_memo(company_info, research, scraped_content)` → returns memo string. But it will be faster internally (other agent handles that).

**Result:** Pipeline goes from 8 steps to 5 steps. Steps 3+4+5 all run in parallel. Two Claude API calls eliminated (prioritizer + cross-validation).

---

## Agent 2 — Rewrite `execution/researcher.py` + Delete `execution/research_prioritizer.py`

**Files you own:** `execution/researcher.py`, `execution/research_prioritizer.py`

**Context:** The researcher runs Tavily + Perplexity searches across 12 research areas. Currently it reads priority levels from a `research_priorities` dict (set by the now-deleted research_prioritizer step) and adjusts behavior per priority. That's being removed — treat all active areas the same.

**Changes to `researcher.py`:**

1. **Remove all priority-awareness.** Delete all code that reads `company_info.get("research_priorities", {})`. No more "high/medium/low/skip" logic. Every area runs the same way.

2. **Cut research areas from 12 to 8.** Remove these 4 lower-value areas that add time without proportional insight:
   - `regulatory_environment` — rarely relevant for early-stage VC
   - `recent_ma_activity` — nice-to-have, not essential
   - `buyer_behavior` — too generic, usually useless results
   - `comparable_exits` — speculative for early-stage companies

   Keep: `market_size`, `market_growth`, `competitors`, `industry_trends`, `recent_funding_sector`, `technology_trends`, `founder_background`, `company_news`

3. **Run ALL 8 areas in a single parallel batch.** No more batching into groups of 3 or 6. Submit all 8 to `ThreadPoolExecutor(max_workers=8)` at once. Remove inter-batch delays entirely (the `time.sleep(RESEARCH_DELAY_SECONDS)` between batches).

4. **Kill the sequential deepening pass.** After the main batch completes, there's currently a loop that re-searches "high priority" areas that returned thin results. Delete this entirely. The waterfall within each area already has fallback logic (Tavily → Perplexity) — that's sufficient.

5. **Simplify the waterfall.** Current waterfall tries 4 things: primary Tavily → primary Perplexity → alt Tavily → alt Perplexity. Cut to 2: Tavily primary → Perplexity fallback. If Tavily returns >300 chars, done. If not, one Perplexity call. No alt queries.

6. **Keep the function signature** `run_research(company_info: dict) -> dict` — don't change it.

7. **Keep the `__main__` smoke test** but update it to not reference priorities.

**Changes to `research_prioritizer.py`:**

1. **Gut the file but don't delete it** (other modules might import it). Replace `prioritize_research()` with a function that immediately returns `{}` (empty dict). Keep the `__main__` block as a no-op that prints "Research prioritizer disabled — all areas run at equal priority."

**Result:** Research step goes from 12 areas × complex waterfall × deepening pass to 8 areas × simple waterfall × no deepening. Fully parallel, no delays.

---

## Agent 3 — Rewrite `execution/memo_writer.py` (Human-Sounding Single-Pass Memo)

**Files you own:** `execution/memo_writer.py`

**Context:** The memo writer currently does: summarize research → Pass 1 (raw analysis) → Pass 2 (add citations [S1], [S2]) → quality check with confidence banners. This is being cut to a single pass that produces a human-sounding analyst memo.

**Changes to make:**

1. **Kill Pass 2 entirely.** No more citation pass. No `[S1]`, `[S2]` inline citations. No `[NO DATA]` markers. No `[UNVERIFIED]` markers. No `CONTRADICTED` warnings. The memo should read like a senior VC analyst wrote it, not like an AI with citation OCD.

2. **Kill `_review_memo()`.** It's already dead code (never called) — delete the function and the `REVIEW_TOOL` definition.

3. **Kill `_quality_check()`.** No more LOW CONFIDENCE banners, citation coverage warnings, or confidence score checks. Delete it.

4. **Simplify `_summarize_research()`.** Remove priority-aware char limits (there are no priorities anymore). Use a single limit of 1500 chars per section. If a section exceeds 1500 chars, truncate it intelligently (keep the first 1500 chars, don't bother with a Claude summarization call). This eliminates up to 12 Claude API calls that were used for summarization.

5. **Rewrite the Pass 1 prompt to be the ONLY pass.** This single prompt should:
   - Produce a polished, final-quality 10-section memo in one shot
   - Write in the voice of a sharp, experienced VC analyst — direct, opinionated, no hedging language
   - Use natural prose, not bullet-point dumps
   - When data is missing, say so plainly ("Revenue figures were not disclosed" not "[NO DATA]")
   - When sources conflict, note it naturally ("The deck claims $5M ARR, though public sources suggest closer to $3M")
   - NO inline citations like [S1] anywhere in the body
   - End with a **Sources** section that lists all data sources used (pitch deck, Tavily results, Perplexity results, scraped pages) as a clean numbered list with URLs where available
   - The tone should be: "I researched this company, here's what I found and what I think" — confident, analytical, occasionally skeptical

6. **Remove all source_tracker dependencies.** Don't load `source_registry.json` or `validation_results.json` from `.tmp/`. Don't import or call anything from `source_tracker`. The memo writer builds the sources list itself from the data it already has (company_info has pitch deck data, research dict has source attributions, scraped_content has URLs).

7. **Keep function signatures unchanged:**
   - `write_memo(company_info: dict, research: dict, scraped_content: dict) -> str`
   - `save_memo(memo_text: str, output_path: str = "output/memo.md") -> None`

8. **Keep the 10 memo sections** (Company Overview, Founding Team, Product & Technology, Market Definition & Sizing, Market Mapping & Competitive Landscape, Industry & Macro Trends, Go-to-Market & Traction, Financials, Risks & Open Questions, Investment Thesis).

9. **Keep the `__main__` smoke test** but simplify it.

**Prompt engineering guidance for the new single-pass prompt:**
- System prompt should say: "You are a senior VC analyst at a top-tier venture fund. Write with authority. Be specific — use numbers, names, dates. Don't pad with generic observations. If you don't have data on something, say so in one sentence and move on. Never use phrases like 'it is worth noting', 'it should be noted', 'interestingly', 'notably', 'in conclusion'. Write like you're briefing a partner before an IC meeting."
- The user prompt should contain all the data (company_info, summarized research, scraped content) and the 10-section structure.

**Result:** Memo generation goes from 2-14 Claude calls to exactly 1 Claude call. Output reads like a human wrote it.

---

## Agent 4 — Simplify `execution/extractor.py`

**Files you own:** `execution/extractor.py`

**Context:** The extractor uses Claude tool_use to pull ~35 structured fields from pitch deck text. It currently has a 4-attempt fallback chain (tool_use full → text-based → simplified tool_use → simplified text → fallback dict). This is overkill. Also, it produces 7 confidence flags that are being removed from the pipeline.

**Changes to make:**

1. **Cut the fallback chain from 4 attempts to 2.** Keep:
   - Attempt 1: `call_claude_tool_use()` with the full `EXTRACTION_TOOL` schema (this works 95%+ of the time)
   - Attempt 2: Text-based `call_claude()` + `try_parse_json()` as fallback
   - If both fail: return the `_ALL_FIELD_DEFAULTS` fallback dict

   Delete the simplified tool_use attempt and the simplified text attempt. They were for edge cases that add 2 extra Claude API calls on failure paths.

2. **Keep the confidence flags in the extraction output** but make them simpler. Instead of 7 separate boolean flags, change to a simpler check: just detect which key fields are null/empty after extraction and set a single `_missing_fields` list. Example: if `founders` is null or empty string, add `"founders"` to the list. This is pure Python logic after the extraction call, no extra API call needed.

   Fields to check for emptiness: `company_name`, `industry`, `founders`, `traction`, `revenue_details`, `tam_sam_som`, `tech_details`

   Add to the returned dict: `"_missing_fields": ["founders", "tam_sam_som"]` (or whatever is empty)

   Remove the old `confidence_flags` dict from the extraction tool schema and the prompt. This simplifies the prompt sent to Claude (shorter prompt = faster response).

3. **Keep the function signature** `extract_company_info(pitch_text: str) -> dict` unchanged.

4. **Keep the `__main__` smoke test** but update it to print `_missing_fields` instead of `confidence_flags`.

5. **Keep the `EXTRACTION_TOOL` schema** but remove the `confidence_flags` property from it. Keep all ~35 data fields.

**Result:** Extraction step stays at 1 Claude call (was already 1 on the happy path), but fails faster (2 attempts max instead of 4). Simpler prompt = faster Claude response.

---

## Agent 5 — Simplify `execution/gap_filler.py` + `execution/source_tracker.py` + `config.py`

**Files you own:** `execution/gap_filler.py`, `execution/source_tracker.py`, `config.py`

**Context:** Gap filler currently uses 7 confidence flags to decide what to search for. Those flags are being replaced by a simple `_missing_fields` list (set by the extractor). Source tracker's cross-validation is being removed from the pipeline. Config has constants that need updating.

**Changes to `gap_filler.py`:**

1. **Switch from confidence flags to `_missing_fields` list.** Instead of checking `company_info.get("confidence_flags", {}).get("company_name_found")`, check if `"company_name"` is in `company_info.get("_missing_fields", [])`. The mapping is straightforward:
   - Old: `confidence_flags.company_name_found == False` → New: `"company_name" in _missing_fields`
   - Old: `confidence_flags.industry_found == False` → New: `"industry" in _missing_fields`
   - Old: `confidence_flags.founders_found == False` → New: `"founders" in _missing_fields`
   - Old: `confidence_flags.traction_found == False` → New: `"traction" in _missing_fields`
   - Old: `confidence_flags.financials_found == False` → New: `"revenue_details" in _missing_fields`
   - Old: `confidence_flags.tam_found == False` → New: `"tam_sam_som" in _missing_fields`
   - Old: `confidence_flags.tech_details_found == False` → New: `"tech_details" in _missing_fields`

2. **Keep the context-enriched query logic** — that's actually good. The queries that incorporate company name, industry, etc. into the Perplexity searches produce better results.

3. **Keep parallel execution** of gap-fill queries.

4. **Keep caching** via `cache.py`.

5. **Keep function signature** `fill_gaps(company_info: dict) -> dict` unchanged.

6. **Keep the `__main__` smoke test** but update it to use `_missing_fields` instead of `confidence_flags`.

**Changes to `source_tracker.py`:**

1. **Keep `build_source_registry()`** — it's pure Python, instant, and the memo writer may still use it to build the sources list. Update it to not reference `confidence_flags`.

2. **Gut `cross_validate()`.** Replace the body with: `return {"status": "disabled", "claims": [], "section_scores": {}}`. It's no longer called from main.py but keep the function so nothing breaks if anything imports it. Remove the Claude API call.

3. **Keep function signatures** unchanged.

4. **Keep the `__main__` smoke test** but simplify it.

**Changes to `config.py`:**

1. **Update these constants** for speed:
   - `RESEARCH_BATCH_SIZE = 8` (was 6, run all 8 areas at once)
   - `RESEARCH_DELAY_SECONDS = 0` (was 0.1, no delay between batches since there's only 1 batch now)
   - `MEMO_MAX_TOKENS = 8000` (was 6000, give the single-pass memo more room)
   - `MAX_SCRAPE_URLS = 2` (already 2, keep it)
   - `MAX_RESEARCH_CHARS_PER_SECTION = 1500` (was 1200, single limit for all sections)

2. **Remove these constants** (no longer used):
   - `MAX_RESEARCH_CHARS_HIGH_PRIORITY` (no more priority tiers)
   - `MAX_VALIDATION_CLAIMS` (no more cross-validation)

3. **Keep all API key validation** and model settings unchanged.

**Result:** Gap filler works with simpler input format. Cross-validation eliminated. Config tuned for speed.

---

## Agent 6 — Update All Directives + Docs

**Files you own:** `directives/*.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `AGENTS.md`

**Context:** The other 5 agents are making code changes that simplify the pipeline. You need to update all documentation to match the new reality. Do NOT change any Python files.

**What changed (summary for your reference):**

1. **Step 2.5 (research prioritizer) deleted.** No more priority ranking. All research areas treated equally.
2. **Step 5.5 (cross-validation) deleted.** No more `cross_validate()` call. `build_source_registry()` still exists but is optional.
3. **Steps 3+4+5 now run in parallel** (was just 3+4).
4. **Research areas cut from 12 to 8.** Removed: `regulatory_environment`, `recent_ma_activity`, `buyer_behavior`, `comparable_exits`.
5. **Memo is single-pass.** No more Pass 2 (citations), no review step, no confidence banners.
6. **No inline citations** `[S1]`, `[S2]` in memo body. Sources listed at end as clean list.
7. **Confidence flags replaced** with `_missing_fields` list.
8. **Extractor fallback chain** cut from 4 attempts to 2.
9. **Researcher waterfall** cut from 4 steps to 2 (Tavily → Perplexity fallback only).
10. **No deepening pass** in researcher.

**Changes to make:**

### `directives/00_pipeline_overview.md`
- Update the step list: remove Step 2.5 and Step 5.5
- Show Steps 3+4+5 as parallel
- Update the data flow diagram
- Remove references to research priorities, cross-validation, source registry

### `directives/02_extract_company_info.md`
- Remove confidence flags section, replace with `_missing_fields` description
- Update fallback chain from 4 to 2 attempts
- Remove references to 7 boolean flags

### `directives/03_fill_gaps.md`
- Update to reference `_missing_fields` instead of confidence flags
- Keep query mappings but update the trigger condition descriptions

### `directives/04_research.md`
- Remove all priority-awareness (high/medium/low/skip)
- Update from 12 to 8 research areas, list which were removed and why
- Remove deepening pass description
- Update waterfall from 4 steps to 2
- Remove batch delay references

### `directives/06_write_memo.md`
- Rewrite for single-pass generation
- Remove Pass 2 (citation pass) description
- Remove review step description
- Remove confidence banner/quality check descriptions
- Add guidance on human-sounding tone
- Update sources section description (clean list at end, no inline citations)

### `directives/07_source_tracking.md`
- Simplify heavily: `build_source_registry()` still exists, `cross_validate()` is disabled
- Remove the cross-validation spec
- Note that source tracking is now optional/simplified

### `CLAUDE.md`
- Update the Data Flow section (remove Steps 2.5 and 5.5, show 3+4+5 parallel)
- Update the Module Contracts section (keep all signatures, note prioritizer returns `{}`)
- Update config constants to match new values
- Update Rules section: remove rule about citations
- Update Integration Test Checklist: remove items 5 (cross-validation), 6 (inline citations). Update item 7 to say "Sources section at end lists data sources used"
- Sync the Commands section (remove research_prioritizer and source_tracker from smoke-test list, or note they're no-ops)

### `ARCHITECTURE.md`
- Update pipeline diagram (remove Steps 2.5 and 5.5)
- Update API Usage Summary table (fewer Claude calls)
- Update Config Quick Reference (new constant values)
- Update file descriptions for changed modules
- Update Module Dependency Graph (remove research_prioritizer dependency from main.py)
- Remove or simplify the "Anti-Hallucination: 5-Layer Defense" section — it's now a simpler approach: source list at end, natural language handling of unknowns

### `AGENTS.md`
- Mirror whatever changes were made to CLAUDE.md (these files should stay in sync per the header comment)

**Result:** All docs match the new simplified pipeline. No stale references to deleted features.

---

## Execution Notes

- **No file conflicts:** Each agent owns distinct files. No two agents edit the same file.
- **Order doesn't matter:** All 6 can run truly in parallel. The code changes are designed to be compatible.
- **After all 6 finish:** Run `python main.py` with a test pitch deck to verify end-to-end. Expected: ~50% faster wall-clock time, same quality research, human-readable memo.
- **Function signatures preserved:** All public function signatures stay the same (per CLAUDE.md rules). Internal implementations change but interfaces don't.

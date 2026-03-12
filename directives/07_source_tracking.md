# Directive: Source Tracking (Simplified)

## Goal
Track the provenance of data points in the pipeline. Cross-validation is disabled — source tracking is now lightweight and optional.

## Execution Scripts
- `execution/source_tracker.py` — source registry builder (cross-validation disabled)

## Source Registry (`build_source_registry`)
- **No API calls** — pure Python
- Walks all data and tags each piece with its origin:
  - Extracted fields from pitch deck -> source type `"pitch_deck"`
  - Fields ending in `_from_perplexity` -> source type `"perplexity_gap_fill"`
  - Research keys + their `{key}_source` -> `"tavily"` or `"perplexity"`
  - Scraped content URLs -> `"firecrawl"`
- Returns: `{"sources": [...], "source_map": {...}}`

The source registry is available for downstream use but is not required by the memo writer. The memo writer builds its own Sources list from the data it already has.

## Cross-Validation (`cross_validate`) — DISABLED
`cross_validate()` returns a stub response: `{"status": "disabled", "claims": [], "section_scores": {}}`. The function signature is preserved for compatibility but makes no API calls. It is not called from `main.py`.

## Dependencies
- anthropic SDK (imported but not used for API calls)
- Uses `api_helpers.py`: `call_claude`, `try_parse_json` (available but unused in current implementation)

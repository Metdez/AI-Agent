# Directive: Fill Data Gaps

## Goal
Use Perplexity to fill any missing fields flagged by the extractor's confidence system.

## Inputs
- Company info dict from `.tmp/company_info.json`

## Execution Scripts
- `execution/gap_filler.py` — runs targeted Perplexity searches for False confidence flags

## Process
1. Load company info from `.tmp/company_info.json`
2. Check `confidence_flags` — if all True, skip and return unchanged
3. For each False flag, run a targeted Perplexity search:
   - `company_name_found=False` -> search with first 200 chars of raw_response
   - `industry_found=False` -> "what industry is {company_name} startup in"
   - `founders_found=False` -> "{company_name} startup founders CEO"
   - `traction_found=False` -> "{company_name} revenue users traction metrics"
4. Store Perplexity results as `{field}_from_perplexity` keys
5. Update actual fields if data was found
6. Save updated dict to `.tmp/company_info.json` (overwrite)

## Outputs
- Updated company_info dict with gaps filled
- Count of gaps filled logged to console

## Edge Cases
- **Perplexity API failure**: Log error, skip that gap, do not crash.
- **Company too obscure**: Perplexity returns generic info — still store it, memo writer will assess quality.
- **All flags True**: Return immediately, no API calls made.

## Dependencies
- requests
- API key: PERPLEXITY_API_KEY
- Model: sonar

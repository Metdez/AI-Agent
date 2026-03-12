# Directive: Fill Data Gaps

## Goal
Use Perplexity to fill any missing fields identified in the extractor's `_missing_fields` list.

## Inputs
- Company info dict from `.tmp/company_info.json`

## Execution Scripts
- `execution/gap_filler.py` — runs targeted Perplexity searches for fields in `_missing_fields`

## Process
1. Load company info from `.tmp/company_info.json`
2. Check `_missing_fields` — if empty, skip and return unchanged
3. Check cache — if cached gap-fill results exist for this company today, return cached
4. For each field in `_missing_fields`, run a context-enriched Perplexity search:
   - `"company_name"` in list -> search with first 200 chars of raw_response
   - `"industry"` in list -> "what industry is {company_name} startup in {product_description snippet}"
   - `"founders"` in list -> "{company_name} startup founders CEO {headquarters} founded {date_founded}"
   - `"traction"` in list -> "{company_name} {industry} {stage} revenue users traction metrics {business_model}"
   - `"revenue_details"` in list -> "{company_name} funding rounds revenue valuation {stage} founded {date_founded}"
   - `"tam_sam_som"` in list -> "{industry_specific} total addressable market size TAM SAM SOM {target_customer} {business_model}"
   - `"tech_details"` in list -> "{company_name} technology stack architecture patents {industry_specific} {product_description snippet}"
5. Store Perplexity results as `{field}_from_perplexity` keys
6. Update actual fields if data was found
7. Save to cache and to `.tmp/company_info.json` (overwrite)

Queries are enriched with available context (industry, stage, business model, etc.) for more targeted results compared to generic searches.

## Outputs
- Updated company_info dict with gaps filled
- Count of gaps filled logged to console

## Edge Cases
- **Perplexity API failure**: Log error, skip that gap, do not crash.
- **Company too obscure**: Perplexity returns generic info — still store it, memo writer will assess quality.
- **No missing fields**: Return immediately, no API calls made.
- **Cache hit**: Return cached results, no API calls made.

## Dependencies
- requests
- API key: PERPLEXITY_API_KEY
- Model: sonar

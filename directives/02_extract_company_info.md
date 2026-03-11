# Directive: Extract Company Info

## Goal
Use Claude to parse pitch deck text into a structured dict with confidence flags.

## Inputs
- Raw pitch text from `.tmp/pitch_text.txt`

## Execution Scripts
- `execution/extractor.py` — calls Claude to extract structured JSON

## Process
1. Load pitch text from `.tmp/pitch_text.txt`
2. Call Claude (claude-sonnet-4-5) with extraction prompt
3. Parse JSON response into structured dict
4. If JSON parse fails, retry once with a simpler prompt asking only for core fields
5. If second attempt fails, return fallback dict with `raw_response` and all confidence flags False
6. Save result to `.tmp/company_info.json`

## Output Schema
```json
{
  "company_name": "string or null",
  "one_line_description": "string or null",
  "product_description": "string or null",
  "industry": "string or null",
  "industry_specific": "string (specific niche, not just 'SaaS')",
  "target_customer": "string or null",
  "business_model": "string or null",
  "founders": ["list of names"],
  "founder_backgrounds": "string or null",
  "traction": "string or null",
  "fundraising_ask": "string or null",
  "headquarters": "string or null",
  "stage": "string or null",
  "keywords_to_research": ["3-5 specific keywords"],
  "mentioned_competitors": ["list"],
  "confidence_flags": {
    "company_name_found": true/false,
    "industry_found": true/false,
    "founders_found": true/false,
    "traction_found": true/false
  }
}
```

## Edge Cases
- **Malformed JSON from LLM**: Strip markdown backticks, try to find JSON object in text, retry with simpler prompt.
- **API failure**: 3 retries with 2s sleep. On total failure, return fallback dict.
- **Very short pitch text**: Still attempt extraction, but expect more null fields.

## Dependencies
- anthropic SDK
- API key: ANTHROPIC_API_KEY

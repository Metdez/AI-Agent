# Directive: Extract Company Info

## Goal
Use Claude to parse pitch deck text into a structured dict with ~35 fields and a `_missing_fields` list.

## Inputs
- Raw pitch text from `.tmp/pitch_text.txt`

## Execution Scripts
- `execution/extractor.py` — calls Claude to extract structured JSON

## Process
1. Load pitch text from `.tmp/pitch_text.txt`
2. **Primary: Claude tool_use extraction** — uses Claude's tool_use feature with a full JSON schema (~35 fields) to enforce structured output. No JSON parsing needed — tool_use returns a parsed dict directly.
3. **Fallback: Text-based extraction** — if tool_use fails, prompt Claude for JSON text and parse with `try_parse_json()`.
4. **Total failure**: Return fallback dict with `raw_response` and all fields at defaults.
5. **Post-extraction**: Check which key fields are null/empty and build `_missing_fields` list (pure Python, no API call).
6. Save result to `.tmp/company_info.json`

Tool_use is preferred because it eliminates JSON parsing edge cases (markdown backticks, extra text, malformed responses).

## `_missing_fields` Detection
After extraction, these 7 fields are checked for emptiness (null, empty string, or empty list):
- `company_name`
- `industry`
- `founders`
- `traction`
- `revenue_details`
- `tam_sam_som`
- `tech_details`

Any empty field is added to `_missing_fields`. Example: `"_missing_fields": ["founders", "tam_sam_som"]`

This list is used by the gap filler (Step 3) to know which fields need Perplexity searches.

## Output Schema
```json
{
  "company_name": "string or null",
  "legal_entity": "string or null",
  "one_line_description": "string or null",
  "product_description": "string or null",
  "industry": "string or null",
  "industry_specific": "string (specific niche, not just 'SaaS')",
  "target_customer": "string or null",
  "business_model": "string or null",
  "date_founded": "string or null",
  "headquarters": "string or null",
  "stage": "string or null",

  "founders": ["list of names"],
  "founder_backgrounds": "string or null",
  "advisors_board": ["list of advisor/board names"],
  "team_size": "string or null",
  "key_hires": "string or null",

  "tech_stack": "string or null",
  "ip_patents": "string or null",
  "product_roadmap": "string or null",

  "tam_sam_som": {
    "tam": "string or null",
    "sam": "string or null",
    "som": "string or null",
    "methodology": "string or null"
  },
  "mentioned_competitors": ["list"],

  "sales_motion": "string or null",
  "customer_count": "string or null",
  "notable_customers": ["list"],
  "distribution_channels": "string or null",
  "partnerships": "string or null",
  "traction": "string or null",
  "cac": "string or null",
  "ltv": "string or null",
  "churn_rate": "string or null",
  "nrr": "string or null",

  "revenue_details": {
    "current_arr": "string or null",
    "mrr": "string or null",
    "revenue_history": "string or null",
    "projections": "string or null"
  },
  "burn_rate": "string or null",
  "runway": "string or null",
  "gross_margin": "string or null",
  "previous_rounds": [
    {"round": "string", "amount": "string", "investors": "string", "valuation": "string"}
  ],
  "fundraising_ask": "string or null",

  "keywords_to_research": ["3-5 specific keywords"],
  "_missing_fields": ["list of field names that were null/empty after extraction"]
}
```

## Edge Cases
- **Tool_use API failure**: Falls back to text-based extraction with JSON parsing.
- **Malformed JSON from LLM**: Strip markdown backticks, try to find JSON object in text.
- **API failure**: 3 retries with 2s sleep. On total failure, return fallback dict.
- **Very short pitch text**: Still attempt extraction, but expect more null fields and a longer `_missing_fields` list.

## Dependencies
- anthropic SDK
- API key: ANTHROPIC_API_KEY

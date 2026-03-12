"""
Execution: LLM-powered extraction of structured company info from pitch deck text.
Uses Gemini native JSON schema output for reliable structured extraction.
"""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from execution.api_helpers import call_gemini, try_parse_json


# --- Fields to check for _missing_fields computation ---

_FIELDS_TO_CHECK = [
    "company_name", "industry", "founders", "traction",
    "revenue_details", "tam_sam_som", "tech_details",
]


# --- JSON schema for Gemini structured output ---

EXTRACTION_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "company_name": {"type": "STRING", "nullable": True},
        "legal_entity": {"type": "STRING", "nullable": True},
        "one_line_description": {"type": "STRING", "nullable": True},
        "product_description": {"type": "STRING", "nullable": True},
        "industry": {"type": "STRING", "nullable": True},
        "industry_specific": {"type": "STRING", "nullable": True},
        "target_customer": {"type": "STRING", "nullable": True},
        "business_model": {"type": "STRING", "nullable": True},
        "date_founded": {"type": "STRING", "nullable": True},
        "headquarters": {"type": "STRING", "nullable": True},
        "stage": {"type": "STRING", "nullable": True},
        "founders": {"type": "ARRAY", "items": {"type": "STRING"}},
        "founder_backgrounds": {"type": "STRING", "nullable": True},
        "advisors_board": {"type": "ARRAY", "items": {"type": "STRING"}},
        "team_size": {"type": "STRING", "nullable": True},
        "key_hires": {"type": "STRING", "nullable": True},
        "tech_stack": {"type": "STRING", "nullable": True},
        "ip_patents": {"type": "STRING", "nullable": True},
        "product_roadmap": {"type": "STRING", "nullable": True},
        "tam_sam_som": {
            "type": "OBJECT",
            "properties": {
                "tam": {"type": "STRING", "nullable": True},
                "sam": {"type": "STRING", "nullable": True},
                "som": {"type": "STRING", "nullable": True},
                "methodology": {"type": "STRING", "nullable": True},
            },
        },
        "mentioned_competitors": {"type": "ARRAY", "items": {"type": "STRING"}},
        "sales_motion": {"type": "STRING", "nullable": True},
        "customer_count": {"type": "STRING", "nullable": True},
        "notable_customers": {"type": "ARRAY", "items": {"type": "STRING"}},
        "distribution_channels": {"type": "STRING", "nullable": True},
        "partnerships": {"type": "STRING", "nullable": True},
        "traction": {"type": "STRING", "nullable": True},
        "cac": {"type": "STRING", "nullable": True},
        "ltv": {"type": "STRING", "nullable": True},
        "churn_rate": {"type": "STRING", "nullable": True},
        "nrr": {"type": "STRING", "nullable": True},
        "revenue_details": {
            "type": "OBJECT",
            "properties": {
                "current_arr": {"type": "STRING", "nullable": True},
                "mrr": {"type": "STRING", "nullable": True},
                "revenue_history": {"type": "STRING", "nullable": True},
                "projections": {"type": "STRING", "nullable": True},
            },
        },
        "burn_rate": {"type": "STRING", "nullable": True},
        "runway": {"type": "STRING", "nullable": True},
        "gross_margin": {"type": "STRING", "nullable": True},
        "previous_rounds": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "round": {"type": "STRING", "nullable": True},
                    "amount": {"type": "STRING", "nullable": True},
                    "investors": {"type": "STRING", "nullable": True},
                    "valuation": {"type": "STRING", "nullable": True},
                },
            },
        },
        "fundraising_ask": {"type": "STRING", "nullable": True},
        "keywords_to_research": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
}

_ALL_FIELD_DEFAULTS = {
    "company_name": None,
    "legal_entity": None,
    "one_line_description": None,
    "product_description": None,
    "industry": None,
    "industry_specific": None,
    "target_customer": None,
    "business_model": None,
    "date_founded": None,
    "headquarters": None,
    "stage": None,
    "founders": [],
    "founder_backgrounds": None,
    "advisors_board": [],
    "team_size": None,
    "key_hires": None,
    "tech_stack": None,
    "ip_patents": None,
    "product_roadmap": None,
    "tam_sam_som": {"tam": None, "sam": None, "som": None, "methodology": None},
    "mentioned_competitors": [],
    "sales_motion": None,
    "customer_count": None,
    "notable_customers": [],
    "distribution_channels": None,
    "partnerships": None,
    "traction": None,
    "cac": None,
    "ltv": None,
    "churn_rate": None,
    "nrr": None,
    "revenue_details": {"current_arr": None, "mrr": None, "revenue_history": None, "projections": None},
    "burn_rate": None,
    "runway": None,
    "gross_margin": None,
    "previous_rounds": [],
    "fundraising_ask": None,
    "keywords_to_research": [],
    "_missing_fields": list(_FIELDS_TO_CHECK),  # all missing on total failure
}


def _compute_missing_fields(result: dict) -> None:
    """Detect which key fields are null/empty and set _missing_fields list."""
    missing = []
    for field in _FIELDS_TO_CHECK:
        val = result.get(field)
        if val is None or val == "" or val == []:
            missing.append(field)
        elif isinstance(val, dict) and all(v is None for v in val.values()):
            missing.append(field)
    result["_missing_fields"] = missing


def extract_company_info(pitch_text: str) -> dict:
    """
    Extract structured company information from pitch deck text using Gemini.
    Uses native JSON schema output for reliable structured extraction.
    On total failure, returns fallback dict with all _missing_fields populated.
    """
    system_prompt = (
        "You are a VC analyst extracting structured data from pitch decks. "
        "Be precise. If a field is unknown return null."
    )

    user_prompt = f"""Extract all company information from this pitch deck text.
Fill every field with data found in the text. Use null for any field not found.

Pitch deck text:
{pitch_text}"""

    # --- Attempt: Gemini structured JSON output ---
    print("  -> Extracting via Gemini structured output...")
    response_text = call_gemini(
        prompt=user_prompt,
        system=system_prompt,
        json_schema=EXTRACTION_SCHEMA,
    )
    if response_text:
        result = try_parse_json(response_text)
        if result and isinstance(result, dict):
            _fill_defaults(result)
            _compute_missing_fields(result)
            populated = sum(1 for k, v in result.items() if not k.startswith("_") and v is not None and v != "" and v != [])
            missing_count = len(result.get("_missing_fields", []))
            print(f"  -> Extraction complete: {populated} fields populated, {missing_count} missing")
            return result

    # --- Total failure ---
    print("  -> Gemini extraction failed. Returning fallback defaults.")
    fallback = dict(_ALL_FIELD_DEFAULTS)
    fallback["_missing_fields"] = list(_FIELDS_TO_CHECK)
    fallback["raw_response"] = response_text or "No response from LLM"
    return fallback


def _fill_defaults(result: dict) -> None:
    """Fill in missing fields with defaults so downstream code doesn't break."""
    for key, default_value in _ALL_FIELD_DEFAULTS.items():
        if key not in result:
            result[key] = default_value



if __name__ == "__main__":
    fake_pitch = (
        "Acme AI is revolutionizing contract review for enterprise legal teams. "
        "Founded in 2022 by Jane Smith (ex-Google, Harvard MBA) and John Doe (Stanford CS PhD). "
        "We use LLMs to automate 80% of routine contract analysis. "
        "Tech stack: Python, React, proprietary NLP models. Patent pending on context-aware clause extraction. "
        "Currently at $2M ARR with 50 enterprise customers including Deloitte and KPMG. "
        "85% gross margin, $50K CAC, $200K LTV, 5% monthly churn, 120% NRR. "
        "TAM: $30B legal tech market. SAM: $8B contract management. SOM: $500M AI contract review. "
        "Raised $3M seed from Sequoia at $15M valuation. Raising $10M Series A. "
        "Team of 25, including VP Engineering (ex-Palantir) and Head of Sales (ex-Salesforce). "
        "Advisory board: Marc Andreessen, Reid Hoffman."
    )
    print("Running extractor smoke test (Gemini structured output)...")
    result = extract_company_info(fake_pitch)
    print(f"Missing fields: {result.get('_missing_fields', [])}")
    print(json.dumps(result, indent=2))

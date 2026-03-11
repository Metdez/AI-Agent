"""
Execution: LLM-powered extraction of structured company info from pitch deck text.
Uses Claude to parse and return structured data with confidence flags.
"""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import ANTHROPIC_API_KEY
from execution.api_helpers import call_claude, try_parse_json


def extract_company_info(pitch_text: str) -> dict:
    """
    Extract structured company information from pitch deck text using Claude.
    On total failure, returns {"raw_response": ..., "confidence_flags": all False}.
    """
    import anthropic

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    system_prompt = (
        "You are a VC analyst. Extract structured data from pitch decks. "
        "Return ONLY valid JSON. No markdown, no backticks, no explanation."
    )

    user_prompt = f"""Extract the following fields from this pitch deck text. Use null for any field not found.

Return this exact JSON structure:
{{
  "company_name": "string or null",
  "one_line_description": "string or null",
  "product_description": "string or null",
  "industry": "string or null",
  "industry_specific": "string -- specific niche like 'AI contract review' not just 'legaltech', or null",
  "target_customer": "string or null",
  "business_model": "string or null",
  "founders": ["list of founder names"] or [],
  "founder_backgrounds": "string or null",
  "traction": "string or null",
  "fundraising_ask": "string or null",
  "headquarters": "string or null",
  "stage": "string or null",
  "keywords_to_research": ["3-5 specific search keywords for deeper research"],
  "mentioned_competitors": ["list"] or [],
  "confidence_flags": {{
    "company_name_found": true/false,
    "industry_found": true/false,
    "founders_found": true/false,
    "traction_found": true/false
  }}
}}

Pitch deck text:
{pitch_text}"""

    # First attempt -- full extraction
    response_text = call_claude(client, system_prompt, user_prompt)
    if response_text:
        result = try_parse_json(response_text)
        if result:
            return result

    # Second attempt -- simplified prompt
    print("  -> First JSON parse failed. Retrying with simplified prompt...")
    simple_prompt = f"""Extract ONLY these fields from the pitch deck. Return valid JSON only.

{{
  "company_name": "string or null",
  "industry": "string or null",
  "industry_specific": "string or null",
  "founders": ["names"] or [],
  "traction": "string or null",
  "keywords_to_research": ["3 keywords"],
  "confidence_flags": {{
    "company_name_found": true/false,
    "industry_found": true/false,
    "founders_found": true/false,
    "traction_found": true/false
  }}
}}

Text:
{pitch_text[:5000]}"""

    response_text_2 = call_claude(client, system_prompt, simple_prompt)
    if response_text_2:
        result = try_parse_json(response_text_2)
        if result:
            defaults = {
                "one_line_description": None,
                "product_description": None,
                "target_customer": None,
                "business_model": None,
                "founder_backgrounds": None,
                "fundraising_ask": None,
                "headquarters": None,
                "stage": None,
                "mentioned_competitors": [],
            }
            for k, v in defaults.items():
                if k not in result:
                    result[k] = v
            return result

    # Total failure
    print("  -> Both extraction attempts failed. Returning raw response.")
    return {
        "raw_response": response_text or response_text_2 or "No response from LLM",
        "company_name": None,
        "one_line_description": None,
        "product_description": None,
        "industry": None,
        "industry_specific": None,
        "target_customer": None,
        "business_model": None,
        "founders": [],
        "founder_backgrounds": None,
        "traction": None,
        "fundraising_ask": None,
        "headquarters": None,
        "stage": None,
        "keywords_to_research": [],
        "mentioned_competitors": [],
        "confidence_flags": {
            "company_name_found": False,
            "industry_found": False,
            "founders_found": False,
            "traction_found": False,
        },
    }



if __name__ == "__main__":
    fake_pitch = (
        "Acme AI is revolutionizing contract review for enterprise legal teams. "
        "Founded by Jane Smith (ex-Google) and John Doe (Stanford CS PhD), "
        "we use LLMs to automate 80% of routine contract analysis. "
        "Currently at $2M ARR with 50 enterprise customers. Raising $10M Series A."
    )
    print("Running extractor smoke test...")
    result = extract_company_info(fake_pitch)
    print(json.dumps(result, indent=2))

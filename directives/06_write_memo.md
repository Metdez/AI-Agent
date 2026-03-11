# Directive: Write Due Diligence Memo

## Goal
Generate a formatted VC due diligence memo using Claude, with quality checking.

## Inputs
- Company info from `.tmp/company_info.json`
- Research results from `.tmp/research_results.json`
- Scraped content from `.tmp/scraped_content.json`

## Execution Scripts
- `execution/memo_writer.py` — calls Claude to write memo, runs quality check

## Process
1. Load all three input files from `.tmp/`
2. Trim each research value to MAX_RESEARCH_CHARS_PER_SECTION (2000 chars)
3. Determine confidence level from flags (High/Medium/Low)
4. Call Claude (claude-sonnet-4-5) with memo writing prompt
5. Quality check: count sections with "unknown" marker
6. If >3 unknown sections, prepend LOW CONFIDENCE MEMO banner
7. Save memo to `output/memo.md`

## Required Memo Sections
```
# Due Diligence Memo: {Company Name}
*Generated: {date} | Data Confidence: {high/medium/low}*

## 1. Company Overview
## 2. Product & Technology
## 3. Founders & Team
## 4. Market Size & Growth
## 5. Competitive Landscape
## 6. Traction & Business Model
## 7. Key Risks & Unknowns
## 8. Data Sources Used
## 9. Suggested Next Diligence Questions (minimum 5)
```

## Rules
- Every statistic must cite its source (Tavily / Perplexity / pitch deck)
- Unknown sections: write exactly "Unknown -- priority question for next founder call"
- Section 8: list every tool used and the query that generated each result
- Section 9: 5 specific, non-generic questions based on actual gaps found
- Never invent or hallucinate statistics or market numbers

## Outputs
- Final memo saved to `output/memo.md`
- Word count logged to console

## Edge Cases
- **Claude API failure**: 3 retries with 2s sleep. On total failure, write error memo.
- **Context overflow**: Research trimmed per section to stay within limits.
- **3+ unknown sections**: LOW CONFIDENCE banner prepended automatically.

## Dependencies
- anthropic SDK
- API key: ANTHROPIC_API_KEY

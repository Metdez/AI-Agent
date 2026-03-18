# Directive: Idea to Technical Plan

## Goal

Transform rough bullet point notes or a brief idea description into a structured, high-quality markdown technical plan that Claude Code can execute effectively during a vibe coding session.

## Inputs

- `input`: A file path to a `.txt` or `.md` file containing rough notes/bullet points, OR raw text passed via stdin
- `output` (optional): Output file path. Defaults to `.tmp/plan_<timestamp>.md`
- `codebase_context` (optional): A brief description of the codebase or project the plan applies to. Helps the LLM generate more accurate file/path references.

## Steps

### 1. Read the input

Load the raw bullet points or idea text from the provided file or stdin.

### 2. Generate the technical plan

Call `execution/idea_to_plan.py` with the raw input. This script uses the Anthropic API to produce a structured plan.

### 3. Review the output

The generated plan will be saved to `.tmp/plan_<timestamp>.md` (or your specified output path). Review it and make any manual edits before dropping it into your project.

### 4. Use in Claude Code

Drop the generated `.md` file into your project root or reference it in a Claude Code session. The clearer the plan, the better the vibe coding results.

---

## Output Format

The script produces a markdown file with this structure:

```
# Technical Plan: <Feature Name>

## Overview
What this change accomplishes and why.

## Context
What part of the codebase this touches. Key existing files or modules relevant to the work.

## Goals
Clear, numbered list of what needs to be achieved.

## Technical Approach
How to implement it — architecture decisions, patterns to follow, libraries to use.

## Files to Modify
List of files that likely need to be created or changed, with a one-line note on what changes in each.

## Implementation Steps
Ordered step-by-step implementation sequence.

## Edge Cases & Constraints
Known gotchas, limitations, or things to be careful about.

## Success Criteria
How to verify the implementation is complete and correct.
```

---

## Edge Cases

- **Vague input**: If the bullet points are too vague, the script will still produce a plan but it may be generic. Add `codebase_context` for better specificity.
- **Very large inputs**: If the input exceeds ~3,000 words, truncate or split it. The script handles up to ~4,000 tokens of input.
- **Missing API key**: Requires `ANTHROPIC_API_KEY` in `.env`. See setup below.

---

## Setup

Add your Anthropic API key to `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Learnings

*(Update this section as you use the system and discover things)*

- Good inputs have: clear feature name, what problem it solves, any constraints or existing patterns to follow
- Better outputs come from including the name of the file or module you're working in

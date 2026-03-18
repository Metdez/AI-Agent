#!/usr/bin/env python3
"""
idea_to_plan.py

Transforms rough bullet point notes into a structured markdown technical plan
suitable for use in a Claude Code vibe coding session.

Usage:
  python execution/idea_to_plan.py --input notes.txt
  python execution/idea_to_plan.py --input notes.txt --output my_plan.md
  python execution/idea_to_plan.py --input notes.txt --context "React + FastAPI app, src/ layout"
  echo "my rough notes" | python execution/idea_to_plan.py
"""

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

import anthropic
from dotenv import load_dotenv


# ── Config ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent.parent  # project root
ENV_PATH = SCRIPT_DIR / ".env"
TMP_DIR = SCRIPT_DIR / ".tmp"

MODEL = "claude-opus-4-6"

SYSTEM_PROMPT = """You are a senior software engineer and technical writer.

Your job is to transform rough notes, bullet points, or a brief idea description into a
clear, structured technical plan that an AI coding assistant (like Claude Code) can
execute effectively during a coding session.

The plan should be specific, actionable, and unambiguous. Write it as if you're briefing
a highly capable engineer who hasn't seen the codebase before — give them everything they
need to get started without fluff.

Always output valid Markdown and follow the exact structure requested."""

PLAN_TEMPLATE = """Transform the following rough notes into a structured technical plan.

{context_section}ROUGH NOTES:
---
{raw_notes}
---

Produce a markdown document with this exact structure:

# Technical Plan: <concise feature name>

## Overview
2–4 sentences. What this change accomplishes and why it matters.

## Context
What part of the codebase this touches. Key existing files, modules, or patterns relevant to the work. If the codebase context is unknown, note that and describe what would likely be involved.

## Goals
Numbered list. Clear, specific outcomes this plan needs to deliver.

## Technical Approach
How to implement it. Architecture decisions, patterns to follow, data flow, libraries or APIs to use. Be concrete.

## Files to Modify
Bullet list of files likely to be created or changed. For each, a one-line note on what changes.

## Implementation Steps
Ordered numbered list. Each step is a discrete, completable task. Steps should be in the order they should be executed.

## Edge Cases & Constraints
Things to watch out for, known limitations, performance considerations, or things that could go wrong.

## Success Criteria
How to verify the implementation is complete and working correctly. Include specific tests or checks where possible.

Be specific. Prefer concrete technical details over vague descriptions. If something in the notes is unclear, make a reasonable technical assumption and note it inline with "(assumed: ...)".
"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_env():
    if ENV_PATH.exists():
        load_dotenv(ENV_PATH)
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("\n❌  ANTHROPIC_API_KEY not found in .env")
        print(f"   Add it to: {ENV_PATH}")
        print("   Example: ANTHROPIC_API_KEY=sk-ant-...\n")
        sys.exit(1)
    return api_key


def read_input(input_path: str | None) -> str:
    if input_path:
        path = Path(input_path)
        if not path.exists():
            print(f"❌  Input file not found: {input_path}")
            sys.exit(1)
        return path.read_text(encoding="utf-8").strip()
    elif not sys.stdin.isatty():
        return sys.stdin.read().strip()
    else:
        print("❌  No input provided. Use --input <file> or pipe text via stdin.")
        sys.exit(1)


def build_prompt(raw_notes: str, codebase_context: str | None) -> str:
    context_section = ""
    if codebase_context:
        context_section = f"CODEBASE CONTEXT:\n{codebase_context}\n\n"
    return PLAN_TEMPLATE.format(
        raw_notes=raw_notes,
        context_section=context_section,
    )


def generate_plan(api_key: str, prompt: str) -> str:
    client = anthropic.Anthropic(api_key=api_key)
    print("⏳  Generating plan...", flush=True)
    message = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def save_plan(plan_text: str, output_path: str | None) -> Path:
    if output_path:
        out = Path(output_path)
    else:
        TMP_DIR.mkdir(exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        out = TMP_DIR / f"plan_{timestamp}.md"

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(plan_text, encoding="utf-8")
    return out


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Transform rough notes into a structured technical plan."
    )
    parser.add_argument(
        "--input", "-i",
        metavar="FILE",
        help="Path to a .txt or .md file with your rough notes",
    )
    parser.add_argument(
        "--output", "-o",
        metavar="FILE",
        help="Output file path (default: .tmp/plan_<timestamp>.md)",
    )
    parser.add_argument(
        "--context", "-c",
        metavar="TEXT",
        help="Brief description of your codebase (e.g. 'React + FastAPI, src/ layout')",
    )
    args = parser.parse_args()

    api_key = load_env()
    raw_notes = read_input(args.input)
    prompt = build_prompt(raw_notes, args.context)
    plan = generate_plan(api_key, prompt)
    out_path = save_plan(plan, args.output)

    print(f"\n✅  Plan saved to: {out_path}")
    print("\n" + "─" * 60)
    print(plan)
    print("─" * 60)


if __name__ == "__main__":
    main()

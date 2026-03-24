# Student Q&A Intelligence — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Project:** Drennen MGMT 305

---

## Overview

Add a student question tracking and analysis feature to the existing Drennen MGMT 305 app. When a professor uploads a ZIP containing student questions, the system automatically extracts student names and their questions, stores them, and generates an AI-powered profile for each student. The teacher can view all students in a sortable table and drill into any student to see their full question history across sessions alongside an AI analysis of their interests and engagement patterns.

---

## Background

The existing pipeline has two phases:
1. **Extract** — downloads ZIP from Supabase Storage, extracts text from PDF/DOCX/TXT
2. **Generate** — sends extracted text to Grok, streams back a 10-section speaker briefing

Student questions are included in the uploaded ZIP as a document where each question is attributed to a student using the format `"First Last-Initial: question text"` (e.g., `"Zack H: What was the hardest decision in year one?"`).

---

## Goals

- Extract student names and questions automatically from uploaded ZIPs
- Store questions per student, linked to the session (speaker) they were asked in
- Generate an AI profile per student summarizing their interests and question patterns
- Give the professor a fast, scannable view of all students with drill-down to individual profiles
- Never make the professor wait — all student processing happens in the background after the briefing is delivered

---

## Architecture

### Phase 3: analyze-students (new)

Triggers automatically after Phase 2 (generate) completes. Runs entirely in the background — the teacher receives their speaker briefing without waiting for this phase.

```
ZIP upload
  └─ Phase 1: extract        (existing)
  └─ Phase 2: generate       (existing — Grok speaker briefing, streamed to client)
  └─ Phase 3: analyze-students  (NEW — fires async after Phase 2)
       ├─ Extraction chain: finds student Q&A pairs → stores in DB
       └─ Analysis chains: one per student, run in parallel → stores AI profiles
```

### LangChain + Gemini

Both chains use **LangChain** (`langchain`, `@langchain/google-genai`) with model `gemini-3-flash-preview`.

**Extraction chain**
- Input: all extracted text from the session's `uploaded_files` rows (same text used for the briefing)
- Task: identify every line matching the pattern `"Name: question"`, return a structured array
- Output schema (Zod): `{ pairs: Array<{ student_name: string, question: string }> }`
- Uses LangChain structured output / `withStructuredOutput`

**Analysis chain**
- Input: a student's full question history (all questions across all sessions, with session/speaker context)
- Task: generate a short AI profile — interests, question style, engagement patterns
- Output: free-text paragraph (~100–150 words) + 2–4 interest tags
- Runs in parallel for all students in the session using `Promise.all`

---

## Data Model

Three new tables added via Supabase migration. All carry `professor_id` for RLS consistency with existing tables.

### `students`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| professor_id | UUID FK → auth.users | RLS owner |
| display_name | TEXT | e.g. "Zack H" — normalized, trimmed |
| created_at | TIMESTAMPTZ | |

Unique constraint on `(professor_id, display_name)` — same student across sessions is one row.

### `student_questions`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| student_id | UUID FK → students | |
| session_id | UUID FK → sessions | which speaker session |
| professor_id | UUID FK → auth.users | RLS owner |
| question_text | TEXT | |
| created_at | TIMESTAMPTZ | |

### `student_analyses`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| student_id | UUID FK → students | |
| professor_id | UUID FK → auth.users | RLS owner |
| analysis_text | TEXT | AI-generated profile paragraph |
| interest_tags | TEXT[] | 2–4 tags e.g. ["Entrepreneurship", "Risk"] |
| generated_at | TIMESTAMPTZ | |

One row per student. Upserted (replaced) each time analysis runs.

---

## API Routes

All routes follow the existing `{ data, error }` envelope using `jsonSuccess()` / `jsonError()`. All use `runtime = 'nodejs'`.

### `POST /api/sessions/[id]/analyze-students`

Triggers Phase 3 for a session. Called internally after Phase 2 completes (fire-and-forget). Can also be called manually by the teacher to re-run.

**Flow:**
1. Fetch all `uploaded_files` rows for the session where `extraction_status = 'completed'`
2. Concatenate extracted text
3. Run extraction chain → get `{ pairs: [{ student_name, question }] }`
4. For each unique `student_name`: upsert into `students` (by `professor_id + display_name`)
5. Insert all questions into `student_questions`
6. Fetch full question history for each student across all sessions
7. Run analysis chain in parallel for all students → upsert into `student_analyses`

**Response:** `{ data: { students_found: number, questions_stored: number } }`

### `GET /api/students`

Returns all students for the authenticated professor with aggregate stats.

**Response:**
```ts
{
  data: Array<{
    id: string
    display_name: string
    question_count: number
    session_count: number
    top_interest: string | null  // first interest tag from latest analysis
  }>
}
```

### `GET /api/students/[id]`

Returns full student profile.

**Response:**
```ts
{
  data: {
    id: string
    display_name: string
    analysis: {
      analysis_text: string
      interest_tags: string[]
      generated_at: string
    } | null
    sessions: Array<{
      session_id: string
      speaker_name: string
      created_at: string
      questions: string[]
    }>
  }
}
```

---

## UI

### `/students` — Students List Page

- Sortable table: Name | Questions | Sessions | Top Interest
- Sort options: Most Questions (default), Most Sessions, A–Z
- Each row links to `/students/[id]`
- Accessible from the top nav alongside the existing Dashboard link
- If Phase 3 hasn't completed yet for any session, a subtle banner: "Analysis in progress..."

### `/students/[id]` — Student Profile Page

Layout (top to bottom):
1. **Header** — student name, total question count, total sessions attended, back link to `/students`
2. **AI Analysis block** — analysis paragraph + interest tags (shown as colored pill badges). If analysis is still generating, show a skeleton/loading state.
3. **Questions by Session** — one collapsible group per session, labeled with speaker name and date. Questions listed as plain text rows.
4. **Re-run Analysis button** — calls `POST /api/sessions/[id]/analyze-students` on demand (for when new sessions are added)

---

## Error Handling

- If extraction chain returns zero pairs (no student questions found in the ZIP), Phase 3 exits silently — no error surfaced to the teacher
- If Gemini API call fails during extraction, log error and mark session with a `student_analysis_status = 'failed'` field (added to `sessions` table)
- If analysis chain fails for one student, log and continue — other students' analyses are not blocked
- LangChain retries: 2 retries with exponential backoff on transient Gemini errors

---

## Dependencies

New packages (added to `app/package.json`):
- `langchain`
- `@langchain/google-genai`
- `zod` (already likely present via Next.js ecosystem — verify before adding)

Environment variable:
- `GOOGLE_API_KEY` — Gemini API key (added to `.env` and `env.example`)

---

## Out of Scope

- Student-facing login or self-service portal (teacher-only in this version)
- Exporting student analysis as PDF/DOCX
- Real-time question submission during live events
- Cross-professor student deduplication

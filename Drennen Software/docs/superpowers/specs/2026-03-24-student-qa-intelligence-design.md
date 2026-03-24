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
2. **Generate** — sends extracted text to Grok, streams back a 10-section speaker briefing via SSE

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
  └─ Phase 3: analyze-students  (NEW — client kicks after SSE complete)
       ├─ Extraction chain: finds student Q&A pairs → stores in DB
       └─ Analysis chains: one per student, run in parallel → stores AI profiles
```

### Phase 3 Trigger Mechanism

**Approach: client-side kick after SSE `complete` event.**

Vercel serverless functions terminate as soon as the response stream closes — there is no reliable "after Phase 2" hook server-side within the same invocation. The simplest approach consistent with the existing architecture is a client-side fire-and-forget: when the browser receives the SSE `complete` event on the session page, it immediately sends a `POST /api/sessions/[id]/analyze-students` request. The client does not await the response or display a loading indicator in the briefing flow. The student analysis page shows its own loading state independently.

This means:
- Phase 3 only runs if the client is present when Phase 2 completes (acceptable — the teacher is watching the stream)
- Phase 3 can always be manually re-triggered from the Students UI
- No dependency on Vercel `waitUntil` or background job infrastructure

Phase 3 route must set `export const maxDuration = 60`. For sessions with many students (10+), parallel Gemini analysis calls may approach this limit. If timeout errors occur in production, increase to `300` (Vercel Pro).

### LangChain + Gemini

Both chains use **LangChain** (`langchain`, `@langchain/google-genai`) with model `gemini-3-flash-preview`.

> **Note:** Verify `gemini-3-flash-preview` is a valid model ID in the Google AI catalog before implementation. The nearest confirmed models as of spec date are in the `gemini-2.0-flash` family. Use `new ChatGoogleGenerativeAI({ model: 'gemini-3-flash-preview' })` — if the model name is invalid, the client returns a 404 at first call. Update the model string as needed.

**Extraction chain**
- Input: all extracted text from the session's `uploaded_files` rows (same text used for the briefing)
- Task: identify every line matching the pattern `"Name: question"` and return a structured array
- Output schema (Zod): `{ pairs: Array<{ student_name: string, question: string }> }`
- Uses LangChain `.withStructuredOutput(zodSchema)`
- Prompt guidance: normalize student names (trim whitespace, title-case). Treat a colon as the delimiter between name and question. Skip lines where the text before the colon is longer than 30 characters (likely not a name). If no pairs are found, return `{ pairs: [] }`.

**Analysis chain**
- Input: a student's full question history (all questions across all sessions, with session/speaker context)
- Task: generate a short AI profile — interests, question style, engagement patterns
- Output: free-text paragraph (~100–150 words) + 2–4 interest tags as a string array
- Output schema (Zod): `{ analysis_text: string, interest_tags: string[] }`
- Runs in parallel for all students in the session using `Promise.allSettled` (one failure does not block others)

---

## Data Model

All new tables and schema changes go in a single new migration: `00005_student_qa_intelligence.sql`.

### `sessions` table — new column

```sql
ALTER TABLE sessions
  ADD COLUMN student_analysis_status TEXT
    CHECK (student_analysis_status IN ('pending', 'completed', 'failed'))
    DEFAULT NULL;
```

`NULL` = Phase 3 has not been attempted. `'pending'` = in progress. `'completed'` or `'failed'` = terminal states.

### `students`

```sql
CREATE TABLE students (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX students_professor_name_idx ON students (professor_id, display_name);
CREATE INDEX students_professor_id_idx ON students (professor_id);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students_select_own" ON students
  FOR SELECT USING (professor_id = auth.uid());

CREATE POLICY "students_insert_own" ON students
  FOR INSERT WITH CHECK (professor_id = auth.uid());
```

> Inserts are done via the admin client (service role) during Phase 3. The INSERT policy is a safety guard; the admin client bypasses RLS.

### `student_questions`

```sql
CREATE TABLE student_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  professor_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX student_questions_student_id_idx ON student_questions (student_id);
CREATE INDEX student_questions_session_id_idx ON student_questions (session_id);
CREATE INDEX student_questions_professor_id_idx ON student_questions (professor_id);

ALTER TABLE student_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_questions_select_own" ON student_questions
  FOR SELECT USING (professor_id = auth.uid());

CREATE POLICY "student_questions_insert_own" ON student_questions
  FOR INSERT WITH CHECK (professor_id = auth.uid());
```

**Idempotency:** Before inserting questions for a session, delete existing `student_questions` rows for that `session_id`. This makes Phase 3 safe to re-run without duplicating questions.

```sql
DELETE FROM student_questions WHERE session_id = $1;
```

### `student_analyses`

```sql
CREATE TABLE student_analyses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  professor_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_text TEXT NOT NULL,
  interest_tags TEXT[] NOT NULL DEFAULT '{}',
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX student_analyses_student_id_idx ON student_analyses (student_id);

ALTER TABLE student_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_analyses_select_own" ON student_analyses
  FOR SELECT USING (professor_id = auth.uid());

CREATE POLICY "student_analyses_insert_own" ON student_analyses
  FOR INSERT WITH CHECK (professor_id = auth.uid());

CREATE POLICY "student_analyses_update_own" ON student_analyses
  FOR UPDATE USING (professor_id = auth.uid());
```

> All writes to `student_analyses` use the admin client (service role), which bypasses RLS. The UPDATE policy is included for consistency with the existing schema pattern and to ensure correctness if a non-admin client ever writes to this table.

Upsert pattern (admin client):
```sql
INSERT INTO student_analyses (student_id, professor_id, analysis_text, interest_tags, generated_at)
VALUES ($1, $2, $3, $4, NOW())
ON CONFLICT (student_id)
DO UPDATE SET analysis_text = EXCLUDED.analysis_text,
              interest_tags = EXCLUDED.interest_tags,
              generated_at  = EXCLUDED.generated_at;
```

---

## API Routes

All routes follow the existing `{ data, error }` envelope using `jsonSuccess()` / `jsonError()`. All use `runtime = 'nodejs'`.

### `POST /api/sessions/[id]/analyze-students`

Triggers Phase 3 for a session. Called client-side (fire-and-forget) after Phase 2 SSE `complete` event. Can also be called manually.

`export const maxDuration = 60` (increase to 300 if timeout errors occur in production).

**Flow:**
1. Fetch all `uploaded_files` rows for the session where `extraction_status = 'completed'`
2. Set `sessions.student_analysis_status = 'pending'`
3. Concatenate extracted text
4. Run extraction chain → get `{ pairs: [{ student_name, question }] }`
5. If `pairs` is empty, set status to `'completed'` and return early
6. For each unique `student_name`: upsert into `students` using `ON CONFLICT (professor_id, display_name) DO NOTHING`, then fetch the row ID
7. Delete existing `student_questions` for this `session_id`, then bulk-insert all questions
8. Fetch full question history per student across all sessions (join `student_questions → sessions` for speaker context)
9. Run analysis chain in parallel via `Promise.allSettled` for all students
10. Upsert each result into `student_analyses` (admin client)
11. Set `sessions.student_analysis_status = 'completed'` (admin client). Only set `'failed'` if the extraction chain itself failed (step 4) — individual analysis chain failures are logged but do not change the session status to `'failed'`. Partial success is acceptable.

> **Orphaned students on partial failure:** If question insertion (step 7) succeeds but analysis (step 9–10) fails entirely, `students` rows exist with no questions (they were deleted in the idempotency step). This is acceptable — re-running Phase 3 will re-insert questions and re-attempt analysis. Orphaned student rows with no questions are filtered out by the `GET /api/students` query (they will have `question_count = 0`).

**Response:** `{ data: { students_found: number, questions_stored: number } }`

**Error codes:**
- `GEMINI_EXTRACTION_ERROR` — LangChain extraction chain failed (500)
- `SESSION_NOT_FOUND` — session ID doesn't exist or doesn't belong to professor (404)

### `GET /api/students`

Returns all students for the authenticated professor with aggregate stats.

**Client:** Use the **server client** (cookie-based auth, respects RLS). Because `professor_id` is denormalized on `students`, the SELECT RLS policy (`professor_id = auth.uid()`) filters automatically — no manual ownership check needed.

```ts
supabase
  .from('students')
  .select(`
    id, display_name,
    student_questions(count),
    student_analyses(interest_tags)
  `)
  .eq('professor_id', professorId)
```

Compute `session_count` as `COUNT(DISTINCT session_id)` — may require a separate Supabase query or a Postgres RPC function (`supabase.rpc(...)`) if the client count syntax is insufficient for `DISTINCT`. Use `student_analyses.interest_tags[0]` as `top_interest`.

**Response:**
```ts
{
  data: Array<{
    id: string
    display_name: string
    question_count: number
    session_count: number
    top_interest: string | null
  }>
}
```

**Error codes:**
- `UNAUTHORIZED` — no active session (401)

### `GET /api/students/[id]`

Returns full student profile. Requires a JOIN: `student_questions → sessions` to get `speaker_name` per session.

**Client:** Use the **server client** (cookie-based auth). The `student_questions` RLS SELECT policy (`professor_id = auth.uid()`) enforces ownership automatically — no additional ownership check needed. Do not use the admin client for this read route.

**Query join path:** `student_questions.session_id → sessions.id → sessions.speaker_name`

```ts
supabase
  .from('student_questions')
  .select(`
    question_text, created_at,
    sessions(id, speaker_name, created_at)
  `)
  .eq('student_id', studentId)
  .order('created_at', { ascending: true })
```

Group results by `session_id` in the route handler before returning.

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

**Error codes:**
- `STUDENT_NOT_FOUND` — student ID doesn't exist or doesn't belong to professor (404)
- `UNAUTHORIZED` — no active session (401)

### `POST /api/students/[id]/reanalyze`

Re-runs the analysis chain for a single student using their full existing question history. Does not re-extract questions. Called from the student profile page "Re-run Analysis" button.

**Flow:**
1. Fetch student's full question history from `student_questions` (join sessions for speaker context)
2. Run analysis chain
3. Upsert result into `student_analyses`

**Response:** `{ data: { analysis_text: string, interest_tags: string[] } }`

**Error codes:**
- `STUDENT_NOT_FOUND` (404)
- `GEMINI_ANALYSIS_ERROR` (500)
- `NO_QUESTIONS` — student has no questions stored yet (400)

---

## UI

### `/students` — Students List Page

- Sortable table: Name | Questions | Sessions | Top Interest
- Sort options: Most Questions (default), Most Sessions, A–Z
- Each row links to `/students/[id]`
- Accessible from the top nav alongside the existing Dashboard link
- If `student_analysis_status = 'pending'` on any recent session, show a subtle banner: "Analysis in progress..."

### `/students/[id]` — Student Profile Page

Layout (top to bottom):
1. **Header** — student name, total question count, total sessions attended, back link to `/students`
2. **AI Analysis block** — analysis paragraph + interest tags as colored pill badges. If `analysis` is null (Phase 3 not yet complete), show a skeleton/loading state with a message: "Analysis generating..."
3. **Questions by Session** — one group per session, labeled with speaker name and date. Questions listed as plain text rows.
4. **Re-run Analysis button** — calls `POST /api/students/[id]/reanalyze`. Updates the analysis block in place when the response returns.

---

## Error Handling

- If extraction chain returns zero pairs, Phase 3 exits with `status = 'completed'` — no error surfaced to the teacher
- If Gemini extraction fails, set `student_analysis_status = 'failed'` on the session and return `GEMINI_EXTRACTION_ERROR`
- If analysis chain fails for individual students, log the error and continue — `Promise.allSettled` ensures other students' analyses are not blocked
- LangChain retries: 2 retries with exponential backoff on transient Gemini errors (configure via LangChain `ChatGoogleGenerativeAI` `maxRetries` option)

---

## Dependencies

New packages (added to `app/package.json`):
- `langchain`
- `@langchain/google-genai`
- `zod` (verify not already present before adding)

New environment variable:
- `GOOGLE_API_KEY` — Gemini API key (add to `.env` and `app/env.example`)

New TypeScript types (add to `app/src/lib/types.ts`):
- `StudentSummary` — matches `GET /api/students` array item shape
- `StudentDetail` — matches `GET /api/students/[id]` response shape
- `StudentAnalysis` — the analysis sub-object (reused in both routes)

---

## Out of Scope

- Student-facing login or self-service portal (teacher-only in this version)
- Exporting student analysis as PDF/DOCX
- Real-time question submission during live events
- Cross-professor student deduplication

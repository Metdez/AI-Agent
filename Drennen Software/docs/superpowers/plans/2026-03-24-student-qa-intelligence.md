# Student Q&A Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic student question extraction, storage, and AI profiling to the existing session pipeline using LangChain + Gemini.

**Architecture:** After the Phase 2 speaker briefing SSE stream completes, the browser fires a background POST to `/api/sessions/[id]/analyze-students`. That route runs two LangChain chains (extraction → student profiles) using `gemini-3-flash-preview` and stores results in three new Supabase tables. The teacher views students at `/students` (sortable table) and drills into `/students/[id]` (AI analysis + question history).

**Tech Stack:** Next.js 15 App Router · Supabase Postgres + RLS · LangChain (`langchain`, `@langchain/google-genai`) · Zod · Tailwind CSS v4 · Jest + ts-jest

---

## File Map

| File | Status | Purpose |
|---|---|---|
| `app/supabase/migrations/00005_student_qa_intelligence.sql` | Create | Schema: 3 new tables + sessions column |
| `app/src/lib/types.ts` | Modify | Add `StudentSummary`, `StudentDetail`, `StudentAnalysis` types |
| `app/src/lib/langchain/extraction.ts` | Create | LangChain extraction chain — finds `"Name: question"` pairs |
| `app/src/lib/langchain/analysis.ts` | Create | LangChain analysis chain — generates student AI profile |
| `app/src/app/api/sessions/[id]/analyze-students/route.ts` | Create | Phase 3 route — orchestrates extraction + analysis |
| `app/src/app/api/students/route.ts` | Create | `GET /api/students` — list with aggregate stats |
| `app/src/app/api/students/[id]/route.ts` | Create | `GET /api/students/[id]` — full student profile |
| `app/src/app/api/students/[id]/reanalyze/route.ts` | Create | `POST /api/students/[id]/reanalyze` — re-run analysis |
| `app/src/app/sessions/[id]/SessionPageClient.tsx` | Modify | Fire Phase 3 after SSE `complete` event |
| `app/src/app/TopNav.tsx` | Modify | Add "Students" nav link |
| `app/src/app/students/page.tsx` | Create | Server component — fetches list, renders `StudentsPageClient` |
| `app/src/app/students/StudentsPageClient.tsx` | Create | Client component — sortable table UI |
| `app/src/app/students/[id]/page.tsx` | Create | Server component — fetches profile, renders `StudentProfileClient` |
| `app/src/app/students/[id]/StudentProfileClient.tsx` | Create | Client component — analysis block + questions by session |
| `app/src/__tests__/student-extraction.test.ts` | Create | Unit tests for extraction chain helper |
| `app/src/__tests__/student-analysis.test.ts` | Create | Unit tests for analysis chain helper |

---

## Task 1: Install Dependencies and Environment Variable

**Files:**
- Modify: `app/package.json`
- Modify: `app/.env` (local only, not committed)
- Modify: `app/env.example`

- [ ] **Step 1: Install LangChain packages**

Run from `app/`:
```bash
cd app
npm install langchain @langchain/google-genai
```

Expected: packages added to `node_modules` and `package.json` dependencies.

- [ ] **Step 2: Verify zod is already present**

```bash
grep '"zod"' app/package.json
```

Expected: shows a `zod` entry. If not present, run `npm install zod`.

- [ ] **Step 3: Add GOOGLE_API_KEY and GEMINI_MODEL to env.example**

In `app/env.example`, add after the existing XAI_API_KEY line:
```
GOOGLE_API_KEY=your_google_ai_api_key_here
GEMINI_MODEL=gemini-3-flash-preview
```

> `GEMINI_MODEL` is optional — defaults to `gemini-3-flash-preview` if not set. Use this to override the model without touching code.

- [ ] **Step 4: Add GOOGLE_API_KEY to your local .env**

In `app/.env`, add your actual Gemini API key:
```
GOOGLE_API_KEY=<your key>
```

> **Model name:** The spec uses `gemini-3-flash-preview`. Before running any chain, verify this is a valid model ID in the Google AI Studio. If it returns a 404, switch to `gemini-2.0-flash` or the latest available flash model.

- [ ] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add "Drennen Software/app/package.json" "Drennen Software/app/package-lock.json" "Drennen Software/app/env.example"
git commit -m "chore: add langchain and google-genai dependencies"
```

---

## Task 2: Database Migration

**Files:**
- Create: `app/supabase/migrations/00005_student_qa_intelligence.sql`

- [ ] **Step 1: Create the migration file**

Create `app/supabase/migrations/00005_student_qa_intelligence.sql` with this exact content:

```sql
-- Add student_analysis_status column to sessions
ALTER TABLE sessions
  ADD COLUMN student_analysis_status TEXT
    CHECK (student_analysis_status IN ('pending', 'completed', 'failed'))
    DEFAULT NULL;

-- students: one row per unique student per professor
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

-- student_questions: one row per question, linked to student + session
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

-- student_analyses: one AI profile per student, upserted on each run
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

- [ ] **Step 2: Apply the migration to your local Supabase**

```bash
cd app
npx supabase db push
```

Expected: migration applies cleanly with no errors.

- [ ] **Step 3: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add "Drennen Software/app/supabase/migrations/00005_student_qa_intelligence.sql"
git commit -m "feat: add student Q&A tables migration"
```

---

## Task 3: TypeScript Types

**Files:**
- Modify: `app/src/lib/types.ts`

- [ ] **Step 1: Add three new types at the end of `app/src/lib/types.ts`**

```typescript
export type StudentAnalysis = {
  analysis_text: string
  interest_tags: string[]
  generated_at: string
}

export type StudentSummary = {
  id: string
  display_name: string
  question_count: number
  session_count: number
  top_interest: string | null
}

export type StudentDetail = {
  id: string
  display_name: string
  analysis: StudentAnalysis | null
  sessions: Array<{
    session_id: string
    speaker_name: string
    created_at: string
    questions: string[]
  }>
}
```

- [ ] **Step 2: Run the linter to confirm no errors**

```bash
cd app
npm run lint
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add "Drennen Software/app/src/lib/types.ts"
git commit -m "feat: add StudentSummary, StudentDetail, StudentAnalysis types"
```

---

## Task 4: LangChain Extraction Chain

**Files:**
- Create: `app/src/lib/langchain/extraction.ts`
- Create: `app/src/__tests__/student-extraction.test.ts`

The extraction chain takes raw text and returns an array of `{ student_name, question }` pairs.

- [ ] **Step 1: Write the failing test**

Create `app/src/__tests__/student-extraction.test.ts`:

```typescript
/**
 * Unit tests for the student question extraction chain helper.
 * Tests the pure parsing/normalization logic without calling the Gemini API.
 */

// The extraction chain wraps LangChain — mock it entirely
jest.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn(),
  })),
}))
jest.mock('langchain/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn(),
  },
}))

// We test the normalizeName helper independently — import it directly
import { normalizeName, buildExtractionPrompt } from '@/lib/langchain/extraction'

describe('normalizeName', () => {
  it('trims whitespace', () => {
    expect(normalizeName('  Zack H  ')).toBe('Zack H')
  })

  it('title-cases the name', () => {
    expect(normalizeName('zack h')).toBe('Zack H')
  })

  it('handles already correct casing', () => {
    expect(normalizeName('Maya R')).toBe('Maya R')
  })
})

describe('buildExtractionPrompt', () => {
  it('includes the extracted text in the prompt', () => {
    const text = 'Zack H: What was the hardest decision?'
    const prompt = buildExtractionPrompt(text)
    expect(prompt).toContain(text)
  })

  it('includes instructions about the Name: question format', () => {
    const prompt = buildExtractionPrompt('some text')
    expect(prompt).toMatch(/colon/i)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app
npx jest --testPathPattern=student-extraction -t "normalizeName" --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/langchain/extraction'`

- [ ] **Step 3: Create the extraction chain**

Create `app/src/lib/langchain/extraction.ts`:

```typescript
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatPromptTemplate } from 'langchain/prompts'
import { z } from 'zod'

// ── Schema ─────────────────────────────────────────────────────────────────

const ExtractionSchema = z.object({
  pairs: z.array(
    z.object({
      student_name: z.string(),
      question: z.string(),
    })
  ),
})

export type ExtractionResult = z.infer<typeof ExtractionSchema>

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalize a student name: trim whitespace and title-case each word.
 * Exported for testing.
 */
export function normalizeName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Build the extraction prompt string from raw text.
 * Exported for testing.
 */
export function buildExtractionPrompt(text: string): string {
  return `You are extracting student Q&A pairs from a document.

Find every line in the text below that follows the format "Name: question" where:
- The part before the colon is a student's name (first name + last initial, e.g. "Zack H")
- The part after the colon is their question
- Skip any line where the text before the colon is longer than 30 characters (it's not a name)
- Normalize each student name: trim whitespace, title-case each word

Return all pairs you find. If you find none, return an empty array.

DOCUMENT TEXT:
${text}`
}

// ── Chain ──────────────────────────────────────────────────────────────────

/**
 * Run the extraction chain against the given text.
 * Returns structured { pairs: [{ student_name, question }] }.
 */
export async function runExtractionChain(text: string): Promise<ExtractionResult> {
  const model = new ChatGoogleGenerativeAI({
    model: process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview',
    maxRetries: 2,
  })

  const structuredModel = model.withStructuredOutput(ExtractionSchema)

  const prompt = ChatPromptTemplate.fromMessages([
    ['human', '{input}'],
  ])

  const chain = prompt.pipe(structuredModel)

  const result = await chain.invoke({ input: buildExtractionPrompt(text) })
  return result
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd app
npx jest --testPathPattern=student-extraction --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add "Drennen Software/app/src/lib/langchain/extraction.ts" "Drennen Software/app/src/__tests__/student-extraction.test.ts"
git commit -m "feat: add LangChain extraction chain for student Q&A pairs"
```

---

## Task 5: LangChain Analysis Chain

**Files:**
- Create: `app/src/lib/langchain/analysis.ts`
- Create: `app/src/__tests__/student-analysis.test.ts`

The analysis chain takes a student's question history and returns an AI profile paragraph + interest tags.

- [ ] **Step 1: Write the failing test**

Create `app/src/__tests__/student-analysis.test.ts`:

```typescript
/**
 * Unit tests for the student analysis chain helper.
 */

jest.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn(),
  })),
}))
jest.mock('langchain/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn(),
  },
}))

import { buildAnalysisPrompt } from '@/lib/langchain/analysis'

describe('buildAnalysisPrompt', () => {
  it('includes the student name', () => {
    const prompt = buildAnalysisPrompt('Zack H', [
      { speaker_name: 'Sarah Chen', question: 'What was your hardest decision?' },
    ])
    expect(prompt).toContain('Zack H')
  })

  it('includes each question in the prompt', () => {
    const prompt = buildAnalysisPrompt('Maya R', [
      { speaker_name: 'Sarah Chen', question: 'How do you lead a team?' },
      { speaker_name: 'Marcus Webb', question: 'What defines success for you?' },
    ])
    expect(prompt).toContain('How do you lead a team?')
    expect(prompt).toContain('What defines success for you?')
  })

  it('includes speaker context for each question', () => {
    const prompt = buildAnalysisPrompt('Jordan T', [
      { speaker_name: 'Marcus Webb', question: 'How did you raise funding?' },
    ])
    expect(prompt).toContain('Marcus Webb')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app
npx jest --testPathPattern=student-analysis -t "buildAnalysisPrompt" --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/langchain/analysis'`

- [ ] **Step 3: Create the analysis chain**

Create `app/src/lib/langchain/analysis.ts`:

```typescript
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatPromptTemplate } from 'langchain/prompts'
import { z } from 'zod'

// ── Schema ─────────────────────────────────────────────────────────────────

const AnalysisSchema = z.object({
  analysis_text: z.string(),
  interest_tags: z.array(z.string()).min(1).max(4),
})

export type AnalysisResult = z.infer<typeof AnalysisSchema>

// ── Types ──────────────────────────────────────────────────────────────────

export type QuestionWithContext = {
  speaker_name: string
  question: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build the analysis prompt from a student's question history.
 * Exported for testing.
 */
export function buildAnalysisPrompt(
  studentName: string,
  questions: QuestionWithContext[]
): string {
  const questionList = questions
    .map((q, i) => `${i + 1}. [Speaker: ${q.speaker_name}] ${q.question}`)
    .join('\n')

  return `You are analyzing the questions asked by a university student to identify their interests and engagement patterns.

Student name: ${studentName}

Questions asked (across all guest speaker sessions):
${questionList}

Write a short professional analysis (100–150 words) that:
- Identifies the student's apparent interests and intellectual curiosity based on the questions
- Notes any recurring themes or patterns across different sessions
- Describes the style of their questions (practical, theoretical, personal, etc.)

Also return 2–4 short interest tags (single words or short phrases) that best represent the student's interests.

Be factual and grounded in the questions shown. Do not invent information.`
}

// ── Chain ──────────────────────────────────────────────────────────────────

/**
 * Run the analysis chain for a single student.
 * Returns { analysis_text, interest_tags }.
 */
export async function runAnalysisChain(
  studentName: string,
  questions: QuestionWithContext[]
): Promise<AnalysisResult> {
  const model = new ChatGoogleGenerativeAI({
    model: process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview',
    maxRetries: 2,
  })

  const structuredModel = model.withStructuredOutput(AnalysisSchema)

  const prompt = ChatPromptTemplate.fromMessages([
    ['human', '{input}'],
  ])

  const chain = prompt.pipe(structuredModel)

  const result = await chain.invoke({
    input: buildAnalysisPrompt(studentName, questions),
  })

  return result
}
```

- [ ] **Step 4: Run all tests to verify they pass**

```bash
cd app
npx jest --testPathPattern=student-analysis --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add "Drennen Software/app/src/lib/langchain/analysis.ts" "Drennen Software/app/src/__tests__/student-analysis.test.ts"
git commit -m "feat: add LangChain analysis chain for student AI profiles"
```

---

## Task 6: Phase 3 API Route — analyze-students

**Files:**
- Create: `app/src/app/api/sessions/[id]/analyze-students/route.ts`

- [ ] **Step 1: Create the route handler**

Create `app/src/app/api/sessions/[id]/analyze-students/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { jsonSuccess, jsonError } from '@/lib/types'
import { runExtractionChain } from '@/lib/langchain/extraction'
import { runAnalysisChain, type QuestionWithContext } from '@/lib/langchain/analysis'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return jsonError('UNAUTHORIZED', 'Not authenticated', 401)
  }

  const admin = createAdminClient()

  // Verify session belongs to this professor
  const { data: session } = await supabase
    .from('sessions')
    .select('id, professor_id')
    .eq('id', sessionId)
    .eq('professor_id', user.id)
    .single()

  if (!session) {
    return jsonError('SESSION_NOT_FOUND', 'Session not found', 404)
  }

  // Mark as pending
  await admin
    .from('sessions')
    .update({ student_analysis_status: 'pending' })
    .eq('id', sessionId)

  // Fetch extracted text from all files
  const { data: files, error: filesError } = await supabase
    .from('uploaded_files')
    .select('extracted_text')
    .eq('session_id', sessionId)
    .eq('extraction_status', 'completed')

  if (filesError || !files || files.length === 0) {
    await admin
      .from('sessions')
      .update({ student_analysis_status: 'completed' })
      .eq('id', sessionId)
    return jsonSuccess({ students_found: 0, questions_stored: 0 })
  }

  const combinedText = files
    .map(f => f.extracted_text ?? '')
    .join('\n\n')

  // Run extraction chain
  let pairs: Array<{ student_name: string; question: string }>
  try {
    const result = await runExtractionChain(combinedText)
    pairs = result.pairs
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[analyze-students] extraction chain failed:', msg)
    await admin
      .from('sessions')
      .update({ student_analysis_status: 'failed' })
      .eq('id', sessionId)
    return jsonError('GEMINI_EXTRACTION_ERROR', msg, 500)
  }

  if (pairs.length === 0) {
    await admin
      .from('sessions')
      .update({ student_analysis_status: 'completed' })
      .eq('id', sessionId)
    return jsonSuccess({ students_found: 0, questions_stored: 0 })
  }

  // Upsert students (one row per unique name per professor)
  const uniqueNames = [...new Set(pairs.map(p => p.student_name))]
  const studentIdMap: Record<string, string> = {}

  for (const name of uniqueNames) {
    // Use upsert with ignoreDuplicates so re-runs don't fail on existing students
    await admin
      .from('students')
      .upsert(
        { professor_id: user.id, display_name: name },
        { onConflict: 'professor_id,display_name', ignoreDuplicates: true }
      )

    // Fetch the student row (guaranteed to exist after upsert)
    const { data: student } = await admin
      .from('students')
      .select('id')
      .eq('professor_id', user.id)
      .eq('display_name', name)
      .single()

    if (student) {
      studentIdMap[name] = student.id
    }
  }

  // Idempotency: delete existing questions for this session, then re-insert
  await admin
    .from('student_questions')
    .delete()
    .eq('session_id', sessionId)

  const questionsToInsert = pairs
    .filter(p => studentIdMap[p.student_name])
    .map(p => ({
      student_id: studentIdMap[p.student_name],
      session_id: sessionId,
      professor_id: user.id,
      question_text: p.question,
    }))

  await admin.from('student_questions').insert(questionsToInsert)

  // Fetch full question history for each student across ALL sessions
  const analysisPromises = Object.entries(studentIdMap).map(async ([name, studentId]) => {
    const { data: allQuestions } = await admin
      .from('student_questions')
      .select('question_text, sessions(speaker_name)')
      .eq('student_id', studentId)

    const questionsWithContext: QuestionWithContext[] = (allQuestions ?? []).map(q => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      speaker_name: (q.sessions as any)?.speaker_name ?? 'Unknown Speaker',
      question: q.question_text,
    }))

    if (questionsWithContext.length === 0) return

    try {
      const analysis = await runAnalysisChain(name, questionsWithContext)

      // Upsert analysis
      await admin.from('student_analyses').upsert(
        {
          student_id: studentId,
          professor_id: user.id,
          analysis_text: analysis.analysis_text,
          interest_tags: analysis.interest_tags,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id' }
      )
    } catch (err: unknown) {
      console.error(`[analyze-students] analysis failed for ${name}:`, err)
      // Continue — other students should not be blocked
    }
  })

  // Run all analysis chains in parallel; partial failure is acceptable
  await Promise.allSettled(analysisPromises)

  // Mark session complete
  await admin
    .from('sessions')
    .update({ student_analysis_status: 'completed' })
    .eq('id', sessionId)

  return jsonSuccess({
    students_found: uniqueNames.length,
    questions_stored: questionsToInsert.length,
  })
}
```


- [ ] **Step 2: Run the linter**

```bash
cd app && npm run lint
```

Expected: no errors (there may be a warning about `any` — that's acceptable for the Supabase join type).

- [ ] **Step 3: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add "Drennen Software/app/src/app/api/sessions/[id]/analyze-students/route.ts"
git commit -m "feat: add Phase 3 analyze-students route"
```

---

## Task 7: GET /api/students Route

**Files:**
- Create: `app/src/app/api/students/route.ts`

- [ ] **Step 1: Create the route**

Create `app/src/app/api/students/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { jsonSuccess, jsonError, type StudentSummary } from '@/lib/types'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return jsonError('UNAUTHORIZED', 'Not authenticated', 401)
  }

  // Fetch students with question count and latest interest tag
  const { data: students, error } = await supabase
    .from('students')
    .select(`
      id,
      display_name,
      student_questions(count),
      student_analyses(interest_tags)
    `)
    .eq('professor_id', user.id)
    .order('display_name', { ascending: true })

  if (error) {
    return jsonError('DB_ERROR', error.message, 500)
  }

  // Fetch session counts separately (COUNT DISTINCT is not directly supported in client)
  const { data: sessionCounts } = await supabase
    .from('student_questions')
    .select('student_id, session_id')
    .eq('professor_id', user.id)

  // Build session count map
  const sessionCountMap: Record<string, Set<string>> = {}
  for (const row of sessionCounts ?? []) {
    if (!sessionCountMap[row.student_id]) {
      sessionCountMap[row.student_id] = new Set()
    }
    sessionCountMap[row.student_id].add(row.session_id)
  }

  const result: StudentSummary[] = (students ?? [])
    // Filter out students with no questions (orphaned from failed Phase 3)
    .filter(s => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const count = (s.student_questions as any)?.[0]?.count ?? 0
      return count > 0
    })
    .map(s => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const questionCount = (s.student_questions as any)?.[0]?.count ?? 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tags: string[] = (s.student_analyses as any)?.[0]?.interest_tags ?? []

      return {
        id: s.id,
        display_name: s.display_name,
        question_count: Number(questionCount),
        session_count: sessionCountMap[s.id]?.size ?? 0,
        top_interest: tags[0] ?? null,
      }
    })

  return jsonSuccess(result)
}
```

- [ ] **Step 2: Run the linter**

```bash
cd app && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add "Drennen Software/app/src/app/api/students/route.ts"
git commit -m "feat: add GET /api/students route"
```

---

## Task 8: GET /api/students/[id] and POST /api/students/[id]/reanalyze Routes

**Files:**
- Create: `app/src/app/api/students/[id]/route.ts`
- Create: `app/src/app/api/students/[id]/reanalyze/route.ts`

- [ ] **Step 1: Create the detail route**

Create `app/src/app/api/students/[id]/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { jsonSuccess, jsonError, type StudentDetail } from '@/lib/types'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studentId } = await params

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return jsonError('UNAUTHORIZED', 'Not authenticated', 401)
  }

  // Fetch student (RLS ensures ownership)
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, display_name')
    .eq('id', studentId)
    .single()

  if (studentError || !student) {
    return jsonError('STUDENT_NOT_FOUND', 'Student not found', 404)
  }

  // Fetch analysis
  const { data: analysis } = await supabase
    .from('student_analyses')
    .select('analysis_text, interest_tags, generated_at')
    .eq('student_id', studentId)
    .single()

  // Fetch questions with session context
  const { data: questions, error: qError } = await supabase
    .from('student_questions')
    .select(`
      question_text,
      created_at,
      sessions(id, speaker_name, created_at)
    `)
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })

  if (qError) {
    return jsonError('DB_ERROR', qError.message, 500)
  }

  // Group questions by session
  const sessionMap: Record<string, {
    session_id: string
    speaker_name: string
    created_at: string
    questions: string[]
  }> = {}

  for (const q of questions ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sess = q.sessions as any
    const sessionId: string = sess?.id ?? 'unknown'
    if (!sessionMap[sessionId]) {
      sessionMap[sessionId] = {
        session_id: sessionId,
        speaker_name: sess?.speaker_name ?? 'Unknown Speaker',
        created_at: sess?.created_at ?? q.created_at,
        questions: [],
      }
    }
    sessionMap[sessionId].questions.push(q.question_text)
  }

  const result: StudentDetail = {
    id: student.id,
    display_name: student.display_name,
    analysis: analysis
      ? {
          analysis_text: analysis.analysis_text,
          interest_tags: analysis.interest_tags,
          generated_at: analysis.generated_at,
        }
      : null,
    sessions: Object.values(sessionMap).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ),
  }

  return jsonSuccess(result)
}
```

- [ ] **Step 2: Create the reanalyze route**

Create `app/src/app/api/students/[id]/reanalyze/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { jsonSuccess, jsonError } from '@/lib/types'
import { runAnalysisChain, type QuestionWithContext } from '@/lib/langchain/analysis'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studentId } = await params

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return jsonError('UNAUTHORIZED', 'Not authenticated', 401)
  }

  // Verify student belongs to this professor (RLS does this automatically)
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, display_name')
    .eq('id', studentId)
    .single()

  if (studentError || !student) {
    return jsonError('STUDENT_NOT_FOUND', 'Student not found', 404)
  }

  // Fetch question history with session context
  const { data: questions } = await supabase
    .from('student_questions')
    .select('question_text, sessions(speaker_name)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })

  if (!questions || questions.length === 0) {
    return jsonError('NO_QUESTIONS', 'Student has no questions stored', 400)
  }

  const questionsWithContext: QuestionWithContext[] = questions.map(q => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    speaker_name: (q.sessions as any)?.speaker_name ?? 'Unknown Speaker',
    question: q.question_text,
  }))

  try {
    const analysis = await runAnalysisChain(student.display_name, questionsWithContext)

    const admin = createAdminClient()
    await admin.from('student_analyses').upsert(
      {
        student_id: studentId,
        professor_id: user.id,
        analysis_text: analysis.analysis_text,
        interest_tags: analysis.interest_tags,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id' }
    )

    return jsonSuccess({
      analysis_text: analysis.analysis_text,
      interest_tags: analysis.interest_tags,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[reanalyze] analysis chain failed:', msg)
    return jsonError('GEMINI_ANALYSIS_ERROR', msg, 500)
  }
}
```

- [ ] **Step 3: Run the linter**

```bash
cd app && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add "Drennen Software/app/src/app/api/students/[id]/route.ts" "Drennen Software/app/src/app/api/students/[id]/reanalyze/route.ts"
git commit -m "feat: add GET /api/students/[id] and POST reanalyze routes"
```

---

## Task 9: Wire Phase 3 into SessionPageClient

**Files:**
- Modify: `app/src/app/sessions/[id]/SessionPageClient.tsx`

- [ ] **Step 1: Add fire-and-forget after SSE `complete` event**

In `SessionPageClient.tsx`, find the `handleGenerate` function. Locate the `complete` event handler around line 329:

```typescript
} else if (currentEvent === 'complete') {
  stopPolling()
  if (mountedRef.current) await loadOutput(session)
  return
}
```

Replace it with:

```typescript
} else if (currentEvent === 'complete') {
  stopPolling()
  // Fire Phase 3 in background — do not await
  fetch(`/api/sessions/${sessionId}/analyze-students`, { method: 'POST' }).catch(() => {
    // Phase 3 failure is silent — teacher can re-trigger from Students page
  })
  if (mountedRef.current) await loadOutput(session)
  return
}
```

- [ ] **Step 2: Run the linter**

```bash
cd app && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add "Drennen Software/app/src/app/sessions/[id]/SessionPageClient.tsx"
git commit -m "feat: fire Phase 3 analyze-students after SSE complete"
```

---

## Task 10: Add Students Link to TopNav

**Files:**
- Modify: `app/src/app/TopNav.tsx`

- [ ] **Step 1: Add Students link**

In `TopNav.tsx`, find the nav content div (around line 22). The current content is:

```tsx
<a
  href="/dashboard"
  className="text-white font-semibold text-base hover:opacity-80 transition-opacity"
  style={{ fontFamily: "'Lora', Georgia, serif" }}
>
  Drennen MGMT 305
</a>
<div className="flex items-center gap-3">
```

Add a Students link between the logo and the user email/logout section:

```tsx
<a
  href="/dashboard"
  className="text-white font-semibold text-base hover:opacity-80 transition-opacity"
  style={{ fontFamily: "'Lora', Georgia, serif" }}
>
  Drennen MGMT 305
</a>
<div className="flex items-center gap-4 ml-6">
  <a
    href="/students"
    className="text-purple-200 text-sm font-medium hover:text-white transition-colors"
  >
    Students
  </a>
</div>
<div className="flex items-center gap-3 ml-auto">
```

> **Note:** You'll need to also wrap the outer div structure to push the logout section to the right. Look at the existing flex layout and adjust `gap-3` / `ml-auto` as needed to keep the layout clean.

- [ ] **Step 2: Run the linter and visually confirm in browser**

```bash
cd app && npm run dev
```

Navigate to `/dashboard` and confirm "Students" link appears in the nav and links to `/students`.

- [ ] **Step 3: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add "Drennen Software/app/src/app/TopNav.tsx"
git commit -m "feat: add Students link to top nav"
```

---

## Task 11: Students List Page (/students)

**Files:**
- Create: `app/src/app/students/page.tsx`
- Create: `app/src/app/students/StudentsPageClient.tsx`

- [ ] **Step 1: Create the server component**

Create `app/src/app/students/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentsPageClient from './StudentsPageClient'

export default async function StudentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <StudentsPageClient />
}
```

- [ ] **Step 2: Create the client component**

Create `app/src/app/students/StudentsPageClient.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import type { StudentSummary } from '@/lib/types'

type SortKey = 'question_count' | 'session_count' | 'display_name'

export default function StudentsPageClient() {
  const [students, setStudents] = useState<StudentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('question_count')

  useEffect(() => {
    fetch('/api/students')
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error.message as string)
        setStudents(json.data as StudentSummary[])
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const sorted = [...students].sort((a, b) => {
    if (sortKey === 'display_name') return a.display_name.localeCompare(b.display_name)
    return b[sortKey] - a[sortKey]
  })

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: '#faf9f6', fontFamily: "'Source Sans 3', Arial, sans-serif" }}
    >
      <div className="h-1 w-full" style={{ backgroundColor: '#f36f21' }} />

      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <h1
            className="text-xl font-bold text-gray-900"
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          >
            Students
          </h1>
          {!loading && (
            <span className="text-sm text-gray-400">{students.length} students</span>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div
              className="w-8 h-8 rounded-full border-4 animate-spin"
              style={{ borderColor: '#f36f21', borderTopColor: 'transparent' }}
            />
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm">{error}</div>
        )}

        {!loading && !error && students.length === 0 && (
          <div className="text-center py-24 text-gray-400 text-sm">
            No students yet. Student profiles are created automatically after you process a session.
          </div>
        )}

        {!loading && !error && students.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Sort controls */}
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
              <span className="text-xs text-gray-400 uppercase tracking-widest">Sort by</span>
              {([
                ['question_count', 'Most Questions'],
                ['session_count', 'Most Sessions'],
                ['display_name', 'A–Z'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSortKey(key)}
                  className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                    sortKey === key
                      ? 'text-white'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                  style={sortKey === key ? { backgroundColor: '#542785' } : {}}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Table */}
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-widest">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-widest">Questions</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-widest">Sessions</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-widest">Top Interest</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, i) => (
                  <tr
                    key={s.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${
                      i === sorted.length - 1 ? 'border-b-0' : ''
                    }`}
                    onClick={() => window.location.href = `/students/${s.id}`}
                  >
                    <td className="px-5 py-4 font-semibold text-gray-900 text-sm">{s.display_name}</td>
                    <td className="px-5 py-4 text-gray-600 text-sm">{s.question_count}</td>
                    <td className="px-5 py-4 text-gray-600 text-sm">{s.session_count}</td>
                    <td className="px-5 py-4 text-sm">
                      {s.top_interest ? (
                        <span
                          className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: '#f3e8ff', color: '#542785' }}
                        >
                          {s.top_interest}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Run the linter**

```bash
cd app && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Smoke test in browser**

```bash
cd app && npm run dev
```

Navigate to `/students`. Confirm: loads without crash, shows empty state if no students exist.

- [ ] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add "Drennen Software/app/src/app/students/page.tsx" "Drennen Software/app/src/app/students/StudentsPageClient.tsx"
git commit -m "feat: add /students list page with sortable table"
```

---

## Task 12: Student Profile Page (/students/[id])

**Files:**
- Create: `app/src/app/students/[id]/page.tsx`
- Create: `app/src/app/students/[id]/StudentProfileClient.tsx`

- [ ] **Step 1: Create the server component**

Create `app/src/app/students/[id]/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentProfileClient from './StudentProfileClient'

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <StudentProfileClient studentId={id} />
}
```

- [ ] **Step 2: Create the client component**

Create `app/src/app/students/[id]/StudentProfileClient.tsx`:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import type { StudentDetail } from '@/lib/types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export default function StudentProfileClient({ studentId }: { studentId: string }) {
  const [data, setData] = useState<StudentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reanalyzing, setReanalyzing] = useState(false)

  const fetchProfile = useCallback(async () => {
    const res = await fetch(`/api/students/${studentId}`)
    const json = await res.json()
    if (json.error) throw new Error(json.error.message as string)
    setData(json.data as StudentDetail)
  }, [studentId])

  useEffect(() => {
    fetchProfile()
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [fetchProfile])

  const handleReanalyze = async () => {
    setReanalyzing(true)
    try {
      const res = await fetch(`/api/students/${studentId}/reanalyze`, { method: 'POST' })
      const json = await res.json()
      if (json.error) throw new Error(json.error.message as string)
      // Refresh profile data to show new analysis
      await fetchProfile()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Re-analysis failed')
    } finally {
      setReanalyzing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div
          className="w-8 h-8 rounded-full border-4 animate-spin"
          style={{ borderColor: '#f36f21', borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-sm mb-4">{error ?? 'Student not found'}</p>
          <a href="/students" className="text-sm text-purple-700 hover:underline">← Back to Students</a>
        </div>
      </div>
    )
  }

  const totalQuestions = data.sessions.reduce((sum, s) => sum + s.questions.length, 0)

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: '#faf9f6', fontFamily: "'Source Sans 3', Arial, sans-serif" }}
    >
      <div className="h-1 w-full" style={{ backgroundColor: '#f36f21' }} />

      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <nav className="text-xs text-gray-400 mb-1 flex items-center gap-1.5">
            <a href="/students" className="hover:text-gray-600 transition-colors">Students</a>
            <span>›</span>
            <span className="text-gray-500">{data.display_name}</span>
          </nav>
          <div className="flex items-center justify-between">
            <div>
              <h1
                className="text-xl font-bold text-gray-900"
                style={{ fontFamily: "'Lora', Georgia, serif" }}
              >
                {data.display_name}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {totalQuestions} questions · {data.sessions.length} sessions
              </p>
            </div>
            <button
              onClick={handleReanalyze}
              disabled={reanalyzing}
              className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors disabled:opacity-40"
              style={{ borderColor: '#542785', color: '#542785' }}
            >
              {reanalyzing ? 'Analyzing…' : 'Re-run Analysis'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* AI Analysis Block */}
        <div
          className="rounded-xl p-6 border"
          style={{ backgroundColor: '#0f172a', borderColor: '#1e3a5f' }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: '#4a9eff' }}
          >
            AI Analysis
          </div>

          {data.analysis ? (
            <>
              <p className="text-gray-300 text-sm leading-relaxed mb-4">
                {data.analysis.analysis_text}
              </p>
              <div className="flex flex-wrap gap-2">
                {data.analysis.interest_tags.map(tag => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full text-xs font-medium"
                    style={{ backgroundColor: '#1e3a5f', color: '#90caf9' }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-3">
                Generated {formatDate(data.analysis.generated_at)}
              </p>
            </>
          ) : (
            <div className="space-y-2">
              <div className="h-3 bg-gray-800 rounded animate-pulse w-full" />
              <div className="h-3 bg-gray-800 rounded animate-pulse w-5/6" />
              <div className="h-3 bg-gray-800 rounded animate-pulse w-4/6" />
              <p className="text-xs text-gray-600 mt-3">Analysis generating…</p>
            </div>
          )}
        </div>

        {/* Questions by Session */}
        <div>
          <h2
            className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4"
          >
            Questions by Session
          </h2>
          <div className="space-y-4">
            {data.sessions.map(session => (
              <div
                key={session.session_id}
                className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm"
              >
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <span className="font-semibold text-sm text-gray-800">
                    {session.speaker_name}
                  </span>
                  <span className="text-xs text-gray-400">{formatDate(session.created_at)}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {session.questions.map((q, i) => (
                    <p key={i} className="px-5 py-3 text-sm text-gray-700 leading-relaxed">
                      {q}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Run the linter**

```bash
cd app && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Smoke test in browser**

```bash
cd app && npm run dev
```

Navigate to `/students`. If students exist, click one and confirm the profile page loads with the analysis block and questions.

- [ ] **Step 5: Run all tests**

```bash
cd app && npm test
```

Expected: all existing + new tests PASS.

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add "Drennen Software/app/src/app/students/[id]/page.tsx" "Drennen Software/app/src/app/students/[id]/StudentProfileClient.tsx"
git commit -m "feat: add /students/[id] student profile page"
```

---

## Task 13: End-to-End Verification

- [ ] **Step 1: Run a full build to check for TypeScript errors**

```bash
cd app && npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 2: Run all tests**

```bash
cd app && npm test
```

Expected: all tests PASS.

- [ ] **Step 3: Manual end-to-end test**

1. Start the dev server: `npm run dev`
2. Log in as the professor
3. Create a new session with a ZIP that includes a file containing student questions in `"Name: question"` format (e.g., `"Zack H: What inspired you?"`)
4. Run Extract, then Generate
5. Confirm the briefing appears as normal
6. Wait ~30 seconds, then navigate to `/students`
7. Confirm the student appears in the table with question count
8. Click the student — confirm the AI analysis block and questions appear
9. Click "Re-run Analysis" — confirm it refreshes with no error

- [ ] **Step 4: Final commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add -A
git commit -m "feat: student Q&A intelligence — complete implementation"
```

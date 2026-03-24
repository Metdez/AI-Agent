import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatPromptTemplate } from '@langchain/core/prompts'
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

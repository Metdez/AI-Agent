import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatPromptTemplate } from '@langchain/core/prompts'
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

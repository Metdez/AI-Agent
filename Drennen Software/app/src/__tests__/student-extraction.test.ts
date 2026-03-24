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
jest.mock('@langchain/core/prompts', () => ({
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

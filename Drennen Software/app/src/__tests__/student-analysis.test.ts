/**
 * Unit tests for the student analysis chain helper.
 */

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

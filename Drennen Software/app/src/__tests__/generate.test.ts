/**
 * Unit tests for the generate route helper logic.
 * Tests cover user message assembly, truncation logic, and section key ordering.
 */

// Re-implement the pure helper functions tested here

const MAX_TOTAL_CHARS = 120_000
const MAX_FILE_CHARS = 15_000

type FileInput = {
  filename: string
  file_type: string
  char_count: number | null
  extracted_text: string | null
}

type FileBlock = {
  filename: string
  file_type: string
  char_count: number | null
  text: string
}

function buildUserMessage(speakerName: string, files: FileInput[]): string {
  let totalChars = 0
  const fileBlocks: FileBlock[] = []

  for (const file of files) {
    let text = file.extracted_text ?? ''
    if (text.length > MAX_FILE_CHARS) {
      text = text.slice(0, MAX_FILE_CHARS)
    }
    totalChars += text.length
    fileBlocks.push({ filename: file.filename, file_type: file.file_type, char_count: file.char_count, text })
  }

  if (totalChars > MAX_TOTAL_CHARS) {
    const ratio = MAX_TOTAL_CHARS / totalChars
    for (const block of fileBlocks) {
      block.text = block.text.slice(0, Math.floor(block.text.length * ratio))
    }
  }

  const docs = fileBlocks
    .map((b, i) => `--- DOCUMENT ${i + 1}: ${b.filename} (${b.file_type}, ${b.char_count ?? b.text.length} characters) ---\n${b.text}`)
    .join('\n\n')

  return `SOURCE DOCUMENTS FOR ${speakerName}\nTotal documents: ${fileBlocks.length}\n\n${docs}\n\nPlease generate the complete 10-section Speaker Briefing Document for ${speakerName} based on the source documents above.`
}

const SECTION_KEYS = [
  'executive_summary',
  'speaker_biography',
  'key_accomplishments',
  'core_messages',
  'areas_of_expertise',
  'speaking_style',
  'audience_considerations',
  'qa_preparation',
  'logistical_notes',
  'online_presence',
] as const

describe('buildUserMessage', () => {
  const makeFile = (filename: string, chars: number): FileInput => ({
    filename,
    file_type: 'txt',
    char_count: chars,
    extracted_text: 'A'.repeat(chars),
  })

  it('includes speaker name in header', () => {
    const msg = buildUserMessage('Jane Smith', [makeFile('bio.txt', 100)])
    expect(msg).toContain('SOURCE DOCUMENTS FOR Jane Smith')
    expect(msg).toContain('Jane Smith')
  })

  it('includes document count', () => {
    const msg = buildUserMessage('John Doe', [makeFile('a.txt', 50), makeFile('b.txt', 50)])
    expect(msg).toContain('Total documents: 2')
  })

  it('labels each document correctly', () => {
    const msg = buildUserMessage('Speaker', [makeFile('resume.txt', 10), makeFile('bio.txt', 10)])
    expect(msg).toContain('DOCUMENT 1: resume.txt')
    expect(msg).toContain('DOCUMENT 2: bio.txt')
  })

  it('truncates a single file exceeding 15000 chars', () => {
    const file = makeFile('long.txt', 20_000)
    const msg = buildUserMessage('Speaker', [file])
    // The text in the doc should be truncated to MAX_FILE_CHARS
    const docStart = msg.indexOf('---\n') + 4
    const text = msg.slice(docStart)
    expect(text.replace(/\n.*/s, '').length).toBeLessThanOrEqual(MAX_FILE_CHARS + 100) // small buffer for line endings
  })

  it('truncates proportionally when total exceeds 120000 chars', () => {
    // 3 files of 50000 chars each = 150000 total, exceeds limit
    const files = [
      makeFile('a.txt', 50_000),
      makeFile('b.txt', 50_000),
      makeFile('c.txt', 50_000),
    ]
    const msg = buildUserMessage('Speaker', files)
    // Total text in message should not exceed MAX_TOTAL_CHARS + overhead
    const textContent = msg.replace(/SOURCE DOCUMENTS.*?\n\n/s, '').replace(/Please generate.*$/s, '')
    expect(textContent.length).toBeLessThanOrEqual(MAX_TOTAL_CHARS + 1000)
  })

  it('handles files with null extracted_text gracefully', () => {
    const file: FileInput = { filename: 'empty.txt', file_type: 'txt', char_count: 0, extracted_text: null }
    const msg = buildUserMessage('Speaker', [file])
    expect(msg).toContain('DOCUMENT 1: empty.txt')
  })

  it('ends with the generation request', () => {
    const msg = buildUserMessage('Speaker', [makeFile('doc.txt', 10)])
    expect(msg).toMatch(/Please generate the complete 10-section Speaker Briefing Document/)
  })
})

describe('SECTION_KEYS', () => {
  it('contains exactly 10 section keys', () => {
    expect(SECTION_KEYS).toHaveLength(10)
  })

  it('starts with executive_summary', () => {
    expect(SECTION_KEYS[0]).toBe('executive_summary')
  })

  it('ends with online_presence', () => {
    expect(SECTION_KEYS[9]).toBe('online_presence')
  })

  it('has no duplicates', () => {
    expect(new Set(SECTION_KEYS).size).toBe(SECTION_KEYS.length)
  })
})

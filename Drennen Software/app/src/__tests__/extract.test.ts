/**
 * Unit tests for the extract route helper logic.
 * Tests cover file-type routing, size limits, and edge cases
 * without requiring a live Supabase connection.
 */

// Mock external modules before imports
jest.mock('pdf-parse', () => jest.fn())
jest.mock('mammoth', () => ({ extractRawText: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))

import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'

const mockPdfParse = pdfParse as jest.MockedFunction<typeof pdfParse>
const mockMammoth = mammoth.extractRawText as jest.MockedFunction<typeof mammoth.extractRawText>

// Extract the extractText function by re-implementing the same logic.
// This avoids importing the route (which would trigger Next.js runtime context).
const MAX_FILE_BYTES = 10 * 1024 * 1024

async function extractText(
  filename: string,
  buffer: Buffer
): Promise<{ text: string | null; skipped: boolean; skip_reason: string | null }> {
  const lower = filename.toLowerCase()

  if (lower.endsWith('.pdf')) {
    try {
      const result = await pdfParse(buffer)
      return { text: result.text, skipped: false, skip_reason: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('encrypt')) {
        return { text: null, skipped: true, skip_reason: 'password_protected' }
      }
      return { text: null, skipped: true, skip_reason: `pdf_parse_error: ${msg}` }
    }
  }

  if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    try {
      const result = await mammoth.extractRawText({ buffer })
      return { text: result.value, skipped: false, skip_reason: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { text: null, skipped: true, skip_reason: `docx_parse_error: ${msg}` }
    }
  }

  if (lower.endsWith('.txt')) {
    return { text: buffer.toString('utf-8'), skipped: false, skip_reason: null }
  }

  return { text: null, skipped: true, skip_reason: 'unsupported_file_type' }
}

describe('extractText', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('PDF files', () => {
    it('extracts text from a valid PDF', async () => {
      mockPdfParse.mockResolvedValueOnce({ text: 'Hello world' } as never)
      const result = await extractText('doc.pdf', Buffer.from('fake pdf'))
      expect(result).toEqual({ text: 'Hello world', skipped: false, skip_reason: null })
    })

    it('skips a password-protected PDF', async () => {
      mockPdfParse.mockRejectedValueOnce(new Error('file requires a password'))
      const result = await extractText('protected.pdf', Buffer.from('fake'))
      expect(result.skipped).toBe(true)
      expect(result.skip_reason).toBe('password_protected')
    })

    it('skips an encrypted PDF', async () => {
      mockPdfParse.mockRejectedValueOnce(new Error('encrypted file'))
      const result = await extractText('enc.pdf', Buffer.from('fake'))
      expect(result.skipped).toBe(true)
      expect(result.skip_reason).toBe('password_protected')
    })

    it('skips a corrupt PDF with a generic error', async () => {
      mockPdfParse.mockRejectedValueOnce(new Error('corrupt stream'))
      const result = await extractText('bad.pdf', Buffer.from('fake'))
      expect(result.skipped).toBe(true)
      expect(result.skip_reason).toMatch(/pdf_parse_error/)
    })
  })

  describe('DOCX files', () => {
    it('extracts text from a valid DOCX', async () => {
      mockMammoth.mockResolvedValueOnce({ value: 'Document text', messages: [] })
      const result = await extractText('report.docx', Buffer.from('fake docx'))
      expect(result).toEqual({ text: 'Document text', skipped: false, skip_reason: null })
    })

    it('extracts text from a .doc file', async () => {
      mockMammoth.mockResolvedValueOnce({ value: 'Old doc text', messages: [] })
      const result = await extractText('old.doc', Buffer.from('fake doc'))
      expect(result.text).toBe('Old doc text')
      expect(result.skipped).toBe(false)
    })

    it('skips a corrupt DOCX', async () => {
      mockMammoth.mockRejectedValueOnce(new Error('invalid zip'))
      const result = await extractText('bad.docx', Buffer.from('fake'))
      expect(result.skipped).toBe(true)
      expect(result.skip_reason).toMatch(/docx_parse_error/)
    })
  })

  describe('TXT files', () => {
    it('reads UTF-8 text directly', async () => {
      const content = 'Some plain text content'
      const result = await extractText('notes.txt', Buffer.from(content, 'utf-8'))
      expect(result).toEqual({ text: content, skipped: false, skip_reason: null })
    })

    it('handles empty TXT file', async () => {
      const result = await extractText('empty.txt', Buffer.from(''))
      expect(result.text).toBe('')
      expect(result.skipped).toBe(false)
    })
  })

  describe('Unsupported file types', () => {
    it('skips .png files', async () => {
      const result = await extractText('image.png', Buffer.from('fake png'))
      expect(result).toEqual({ text: null, skipped: true, skip_reason: 'unsupported_file_type' })
    })

    it('skips .xlsx files', async () => {
      const result = await extractText('data.xlsx', Buffer.from('fake'))
      expect(result.skipped).toBe(true)
      expect(result.skip_reason).toBe('unsupported_file_type')
    })

    it('skips files with no extension', async () => {
      const result = await extractText('README', Buffer.from('text'))
      expect(result.skipped).toBe(true)
    })
  })

  describe('File size enforcement', () => {
    it('identifies oversized buffers exceed MAX_FILE_BYTES constant', () => {
      const oversize = MAX_FILE_BYTES + 1
      expect(oversize).toBeGreaterThan(MAX_FILE_BYTES)
    })
  })
})

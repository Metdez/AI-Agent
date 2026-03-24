/**
 * Unit tests for session route helper logic.
 * Covers: POST /api/sessions validation, GET /api/sessions/[id] ownership,
 * and POST /api/sessions/[id]/confirm-upload storage verification.
 */

// ---------------------------------------------------------------------------
// Shared types / helpers (mirror src/lib/types.ts to avoid Next.js runtime)
// ---------------------------------------------------------------------------

const MAX_ZIP_BYTES = 26214400 // 25 MB
const SIGNED_URL_EXPIRY = 600  // seconds

type CreateSessionInput = {
  speaker_name?: unknown
  zip_filename?: unknown
  zip_size_bytes?: unknown
}

type ValidationResult =
  | { ok: true; speaker_name: string; zip_filename: string; zip_size_bytes: number }
  | { ok: false; code: string; message: string; status: number }

function validateCreateSession(body: CreateSessionInput): ValidationResult {
  const speaker_name = typeof body.speaker_name === 'string' ? body.speaker_name.trim() : ''
  const zip_filename = typeof body.zip_filename === 'string' ? body.zip_filename.trim() : ''
  const zip_size_bytes = typeof body.zip_size_bytes === 'number' ? body.zip_size_bytes : -1

  if (!speaker_name || speaker_name.length > 200) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'speaker_name is required and must be 1–200 characters', status: 400 }
  }
  if (!zip_filename) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'zip_filename is required', status: 400 }
  }
  if (zip_size_bytes < 0 || !Number.isInteger(zip_size_bytes)) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'zip_size_bytes must be a non-negative integer', status: 400 }
  }
  if (zip_size_bytes > MAX_ZIP_BYTES) {
    return { ok: false, code: 'FILE_TOO_LARGE', message: 'File exceeds the 25 MB limit', status: 422 }
  }

  return { ok: true, speaker_name, zip_filename, zip_size_bytes }
}

function buildUploadPath(professorId: string, sessionId: string, zipFilename: string): string {
  return `${professorId}/${sessionId}/${zipFilename}`
}

function buildExpiresAt(nowMs: number, expirySeconds: number): string {
  return new Date(nowMs + expirySeconds * 1000).toISOString()
}

// ---------------------------------------------------------------------------
// POST /api/sessions — validation
// ---------------------------------------------------------------------------

describe('validateCreateSession', () => {
  it('accepts a valid request', () => {
    const result = validateCreateSession({ speaker_name: 'Jane Doe', zip_filename: 'docs.zip', zip_size_bytes: 1024 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.speaker_name).toBe('Jane Doe')
      expect(result.zip_filename).toBe('docs.zip')
      expect(result.zip_size_bytes).toBe(1024)
    }
  })

  it('trims whitespace from speaker_name and zip_filename', () => {
    const result = validateCreateSession({ speaker_name: '  Jane  ', zip_filename: ' docs.zip ', zip_size_bytes: 100 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.speaker_name).toBe('Jane')
      expect(result.zip_filename).toBe('docs.zip')
    }
  })

  it('rejects empty speaker_name', () => {
    const result = validateCreateSession({ speaker_name: '', zip_filename: 'docs.zip', zip_size_bytes: 100 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.status).toBe(400)
    }
  })

  it('rejects whitespace-only speaker_name', () => {
    const result = validateCreateSession({ speaker_name: '   ', zip_filename: 'docs.zip', zip_size_bytes: 100 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('rejects speaker_name exceeding 200 characters', () => {
    const result = validateCreateSession({ speaker_name: 'A'.repeat(201), zip_filename: 'docs.zip', zip_size_bytes: 100 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.status).toBe(400)
    }
  })

  it('accepts speaker_name of exactly 200 characters', () => {
    const result = validateCreateSession({ speaker_name: 'A'.repeat(200), zip_filename: 'docs.zip', zip_size_bytes: 100 })
    expect(result.ok).toBe(true)
  })

  it('rejects missing zip_filename', () => {
    const result = validateCreateSession({ speaker_name: 'Speaker', zip_filename: '', zip_size_bytes: 100 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.status).toBe(400)
    }
  })

  it('rejects non-string speaker_name', () => {
    const result = validateCreateSession({ speaker_name: 42, zip_filename: 'docs.zip', zip_size_bytes: 100 })
    expect(result.ok).toBe(false)
  })

  it('rejects negative zip_size_bytes', () => {
    const result = validateCreateSession({ speaker_name: 'Speaker', zip_filename: 'docs.zip', zip_size_bytes: -1 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('rejects non-integer zip_size_bytes', () => {
    const result = validateCreateSession({ speaker_name: 'Speaker', zip_filename: 'docs.zip', zip_size_bytes: 100.5 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('accepts zip_size_bytes = 0', () => {
    const result = validateCreateSession({ speaker_name: 'Speaker', zip_filename: 'docs.zip', zip_size_bytes: 0 })
    expect(result.ok).toBe(true)
  })

  it('rejects zip_size_bytes exceeding 25 MB', () => {
    const result = validateCreateSession({ speaker_name: 'Speaker', zip_filename: 'docs.zip', zip_size_bytes: MAX_ZIP_BYTES + 1 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('FILE_TOO_LARGE')
      expect(result.status).toBe(422)
    }
  })

  it('accepts zip_size_bytes at exactly 25 MB', () => {
    const result = validateCreateSession({ speaker_name: 'Speaker', zip_filename: 'docs.zip', zip_size_bytes: MAX_ZIP_BYTES })
    expect(result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Upload path & expiry helpers
// ---------------------------------------------------------------------------

describe('buildUploadPath', () => {
  it('constructs the correct storage path', () => {
    const path = buildUploadPath('prof-1', 'sess-2', 'speaker_docs.zip')
    expect(path).toBe('prof-1/sess-2/speaker_docs.zip')
  })

  it('uses the original filename exactly', () => {
    const path = buildUploadPath('u', 's', 'My File (2).zip')
    expect(path).toContain('My File (2).zip')
  })
})

describe('buildExpiresAt', () => {
  it('returns an ISO string 10 minutes in the future', () => {
    const now = new Date('2026-01-01T00:00:00.000Z').getTime()
    const result = buildExpiresAt(now, SIGNED_URL_EXPIRY)
    expect(result).toBe('2026-01-01T00:10:00.000Z')
  })

  it('returns a valid ISO date string', () => {
    const result = buildExpiresAt(Date.now(), SIGNED_URL_EXPIRY)
    expect(() => new Date(result)).not.toThrow()
    expect(new Date(result).toISOString()).toBe(result)
  })
})

// ---------------------------------------------------------------------------
// GET /api/sessions/[id] — ownership guard logic
// ---------------------------------------------------------------------------

type SessionRow = { id: string; professor_id: string } | null

function canAccessSession(session: SessionRow, userId: string): boolean {
  if (!session) return false
  return session.professor_id === userId
}

describe('canAccessSession', () => {
  it('allows access when professor_id matches', () => {
    expect(canAccessSession({ id: 'sess-1', professor_id: 'user-1' }, 'user-1')).toBe(true)
  })

  it('denies access when professor_id does not match', () => {
    expect(canAccessSession({ id: 'sess-1', professor_id: 'user-1' }, 'user-2')).toBe(false)
  })

  it('denies access for null session', () => {
    expect(canAccessSession(null, 'user-1')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// confirm-upload — storage path parsing for list() prefix/filename split
// ---------------------------------------------------------------------------

function splitStoragePath(storagePath: string): { prefix: string; filename: string } {
  const parts = storagePath.split('/')
  const filename = parts.pop() ?? ''
  const prefix = parts.join('/')
  return { prefix, filename }
}

describe('splitStoragePath', () => {
  it('correctly separates prefix and filename', () => {
    const { prefix, filename } = splitStoragePath('prof-id/sess-id/speaker.zip')
    expect(prefix).toBe('prof-id/sess-id')
    expect(filename).toBe('speaker.zip')
  })

  it('handles a filename with spaces', () => {
    const { prefix, filename } = splitStoragePath('uid/sid/My Speaker Docs.zip')
    expect(prefix).toBe('uid/sid')
    expect(filename).toBe('My Speaker Docs.zip')
  })

  it('returns empty prefix for a root-level path', () => {
    const { prefix, filename } = splitStoragePath('file.zip')
    expect(prefix).toBe('')
    expect(filename).toBe('file.zip')
  })
})

// ---------------------------------------------------------------------------
// Storage presence check — simulates the list() → fileList.length guard
// ---------------------------------------------------------------------------

function storageObjectExists(fileList: unknown[] | null | undefined): boolean {
  return Array.isArray(fileList) && fileList.length > 0
}

describe('storageObjectExists', () => {
  it('returns true when file list has entries', () => {
    expect(storageObjectExists([{ name: 'speaker.zip' }])).toBe(true)
  })

  it('returns false for empty list', () => {
    expect(storageObjectExists([])).toBe(false)
  })

  it('returns false for null', () => {
    expect(storageObjectExists(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(storageObjectExists(undefined)).toBe(false)
  })
})

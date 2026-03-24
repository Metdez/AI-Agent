/**
 * Unit tests for export route helper logic.
 * Covers: safeFilename, formatDate, auth branch selection, status guard.
 *
 * Pattern: extract pure helpers and test them in isolation — no Supabase mocks needed.
 */

// ---------------------------------------------------------------------------
// Helpers (re-declared here to mirror the source without importing Next.js runtime)
// ---------------------------------------------------------------------------

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_') || 'briefing'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// safeFilename
// ---------------------------------------------------------------------------

describe('safeFilename', () => {
  it('passes through clean alphanumeric names unchanged', () => {
    expect(safeFilename('JaneDoe')).toBe('JaneDoe')
  })

  it('converts internal spaces to underscores', () => {
    expect(safeFilename('Jane Doe')).toBe('Jane_Doe')
  })

  it('collapses multiple spaces into a single underscore', () => {
    expect(safeFilename('Jane  Doe')).toBe('Jane_Doe')
  })

  it('strips special characters', () => {
    expect(safeFilename('Jane/Doe')).toBe('JaneDoe')
    expect(safeFilename('Jane@Doe!')).toBe('JaneDoe')
    expect(safeFilename('Dr. Jane Doe, Ph.D.')).toBe('Dr_Jane_Doe_PhD')
  })

  it('preserves hyphens and underscores', () => {
    expect(safeFilename('Jane-Doe_2')).toBe('Jane-Doe_2')
  })

  it('falls back to "briefing" for empty string after stripping', () => {
    expect(safeFilename('')).toBe('briefing')
  })

  it('falls back to "briefing" when all characters are stripped', () => {
    expect(safeFilename('!!!')).toBe('briefing')
  })

  it('trims leading and trailing spaces before converting', () => {
    expect(safeFilename('  Jane Doe  ')).toBe('Jane_Doe')
  })
})

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe('formatDate', () => {
  it('formats a known ISO string to English long date containing the year', () => {
    const result = formatDate('2026-01-15T12:00:00.000Z')
    expect(result).toMatch(/2026/)
    expect(result).toMatch(/January/)
  })

  it('returns a non-empty string for any valid ISO input', () => {
    const result = formatDate('2025-06-01T12:00:00.000Z')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('includes the month name (long format)', () => {
    const result = formatDate('2026-03-24T00:00:00.000Z')
    // Month name should be present (March or equivalent locale variant)
    expect(result).toMatch(/March/)
  })
})

// ---------------------------------------------------------------------------
// Auth branch selection
// Mirror pattern from sessions.test.ts: pure helper that mirrors route logic
// ---------------------------------------------------------------------------

type AuthMode = 'token' | 'cookie'

function selectAuthMode(tokenParam: string | null): AuthMode {
  return tokenParam ? 'token' : 'cookie'
}

describe('selectAuthMode', () => {
  it('returns "token" when a token query param is present', () => {
    expect(selectAuthMode('some.jwt.token')).toBe('token')
  })

  it('returns "cookie" when token param is null', () => {
    expect(selectAuthMode(null)).toBe('cookie')
  })

  it('returns "cookie" for empty string (falsy)', () => {
    expect(selectAuthMode('')).toBe('cookie')
  })
})

// ---------------------------------------------------------------------------
// Status guard logic
// ---------------------------------------------------------------------------

type SessionStatus = 'pending' | 'processing' | 'completed' | 'failed'

function isSessionReady(status: SessionStatus): boolean {
  return status === 'completed'
}

describe('isSessionReady', () => {
  it('returns true for completed status', () => {
    expect(isSessionReady('completed')).toBe(true)
  })

  it('returns false for pending', () => {
    expect(isSessionReady('pending')).toBe(false)
  })

  it('returns false for processing', () => {
    expect(isSessionReady('processing')).toBe(false)
  })

  it('returns false for failed', () => {
    expect(isSessionReady('failed')).toBe(false)
  })
})

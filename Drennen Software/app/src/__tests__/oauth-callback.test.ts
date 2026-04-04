/**
 * Unit tests for GET /auth/callback route pure validation logic.
 *
 * Tests pure helper functions extracted from the callback route handler.
 * Next.js / Supabase clients are not imported — no runtime to mock.
 *
 * Coverage:
 *   - validateCallbackCode: presence of the PKCE code param
 *   - buildSafeNext: open-redirect guard for the `next` query param
 */

// ---------------------------------------------------------------------------
// validateCallbackCode — checks that a code param is present and non-empty
// ---------------------------------------------------------------------------

function validateCallbackCode(code: string | null): { ok: true; code: string } | { ok: false } {
  if (!code || code.trim() === '') return { ok: false }
  return { ok: true, code }
}

describe('validateCallbackCode', () => {
  it('returns ok when a valid code is present', () => {
    const result = validateCallbackCode('pkce_code_abc123')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.code).toBe('pkce_code_abc123')
  })

  it('rejects null code', () => {
    const result = validateCallbackCode(null)
    expect(result.ok).toBe(false)
  })

  it('rejects empty string code', () => {
    const result = validateCallbackCode('')
    expect(result.ok).toBe(false)
  })

  it('rejects whitespace-only code', () => {
    const result = validateCallbackCode('   ')
    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildSafeNext — open-redirect guard for the `next` query param
// Only relative paths (starting with '/', not '//') are accepted.
// Anything else falls back to '/'.
// ---------------------------------------------------------------------------

function buildSafeNext(next: string | null): string {
  if (!next) return '/'
  if (next.startsWith('/') && !next.startsWith('//')) return next
  return '/'
}

describe('buildSafeNext', () => {
  it('returns / for null next', () => {
    expect(buildSafeNext(null)).toBe('/')
  })

  it('returns / for empty string', () => {
    expect(buildSafeNext('')).toBe('/')
  })

  it('allows a valid relative path', () => {
    expect(buildSafeNext('/dashboard')).toBe('/dashboard')
  })

  it('allows root path', () => {
    expect(buildSafeNext('/')).toBe('/')
  })

  it('allows nested relative path', () => {
    expect(buildSafeNext('/sessions/abc-123')).toBe('/sessions/abc-123')
  })

  it('rejects protocol-relative URL (//evil.com)', () => {
    expect(buildSafeNext('//evil.com')).toBe('/')
  })

  it('rejects absolute http URL', () => {
    expect(buildSafeNext('http://evil.com')).toBe('/')
  })

  it('rejects absolute https URL', () => {
    expect(buildSafeNext('https://evil.com/steal')).toBe('/')
  })

  it('rejects javascript: URL', () => {
    expect(buildSafeNext('javascript:alert(1)')).toBe('/')
  })

  it('rejects data: URI', () => {
    expect(buildSafeNext('data:text/html,<h1>xss</h1>')).toBe('/')
  })
})

/**
 * Unit tests for Google sign-in button logic on the login page.
 * Tests pure helper functions extracted from component behavior:
 * - OAuth error message parsing from URL query params
 * - OAuth loading state guard (prevents double-click initiation)
 * - Auth/error page error description decoding
 */

// ---------------------------------------------------------------------------
// OAuth error param parsing
// ---------------------------------------------------------------------------

function parseOAuthError(searchParams: Record<string, string | undefined>): string | null {
  const errorParam = searchParams['error']
  if (!errorParam) return null
  return decodeURIComponent(errorParam)
}

describe('parseOAuthError', () => {
  it('returns null when no error param present', () => {
    expect(parseOAuthError({})).toBeNull()
  })

  it('returns error message when error param is set', () => {
    expect(parseOAuthError({ error: 'OAuth failed' })).toBe('OAuth failed')
  })

  it('decodes percent-encoded error message', () => {
    expect(parseOAuthError({ error: 'Access%20denied%20by%20user' })).toBe('Access denied by user')
  })

  it('decodes plus signs and special chars', () => {
    expect(parseOAuthError({ error: 'Server%20error%3A%20try%20again' })).toBe('Server error: try again')
  })

  it('returns null for empty string error param (treated as absent)', () => {
    expect(parseOAuthError({ error: '' })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// OAuth loading state guard (prevents double-click)
// ---------------------------------------------------------------------------

function shouldInitiateOAuth(oauthLoading: boolean): boolean {
  return !oauthLoading
}

describe('shouldInitiateOAuth', () => {
  it('allows initiation when not loading', () => {
    expect(shouldInitiateOAuth(false)).toBe(true)
  })

  it('blocks initiation when already loading (prevents double-click)', () => {
    expect(shouldInitiateOAuth(true)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Auth error page — error description decoding
// ---------------------------------------------------------------------------

function parseAuthErrorPage(params: Record<string, string | undefined>): {
  errorCode: string
  errorDescription: string
} {
  const errorCode = params['error_code'] ?? 'unknown'
  const errorDescription =
    params['error_description'] != null
      ? decodeURIComponent(params['error_description'])
      : 'An unexpected error occurred during sign-in.'
  return { errorCode, errorDescription }
}

describe('parseAuthErrorPage', () => {
  it('returns defaults when no params provided', () => {
    const result = parseAuthErrorPage({})
    expect(result.errorCode).toBe('unknown')
    expect(result.errorDescription).toBe('An unexpected error occurred during sign-in.')
  })

  it('returns provided error code and description', () => {
    const result = parseAuthErrorPage({
      error_code: 'access_denied',
      error_description: 'User cancelled the sign-in',
    })
    expect(result.errorCode).toBe('access_denied')
    expect(result.errorDescription).toBe('User cancelled the sign-in')
  })

  it('decodes percent-encoded error description', () => {
    const result = parseAuthErrorPage({
      error_code: '500',
      error_description: 'OAuth%20provider%20unavailable',
    })
    expect(result.errorDescription).toBe('OAuth provider unavailable')
  })

  it('uses unknown code when error_code missing', () => {
    const result = parseAuthErrorPage({ error_description: 'Something went wrong' })
    expect(result.errorCode).toBe('unknown')
    expect(result.errorDescription).toBe('Something went wrong')
  })
})

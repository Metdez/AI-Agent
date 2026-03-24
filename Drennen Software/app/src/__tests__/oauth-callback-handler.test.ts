/**
 * Route handler tests for GET /auth/callback.
 *
 * Tests the actual exported GET handler by mocking @supabase/ssr,
 * next/headers, and next/server. Verifies the three behavioral paths:
 *   - Happy path: valid code → session exchange succeeds → 302 to safeNext
 *   - Error path: valid code → exchange fails → 302 to /auth/error
 *   - Missing-code path: no code param → 302 to /auth/error
 */

const mockExchangeCodeForSession = jest.fn()

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  })),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({
    getAll: jest.fn().mockReturnValue([]),
    set: jest.fn(),
  })),
}))

const mockRedirect = jest.fn()
jest.mock('next/server', () => ({
  NextResponse: {
    redirect: (url: URL) => {
      mockRedirect(url.toString())
      return { status: 302, url: url.toString() }
    },
  },
}))

import { GET } from '../app/auth/callback/route'

// Minimal mock request — route only reads request.url
function makeRequest(url: string): Parameters<typeof GET>[0] {
  return { url } as Parameters<typeof GET>[0]
}

describe('GET /auth/callback route handler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('happy path', () => {
    it('redirects to /dashboard when no next param and exchange succeeds', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null })

      await GET(makeRequest('http://localhost:3000/auth/callback?code=pkce_code_abc'))

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('pkce_code_abc')
      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/dashboard')
    })

    it('redirects to custom next param when exchange succeeds', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null })

      await GET(makeRequest('http://localhost:3000/auth/callback?code=abc&next=/sessions'))

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/sessions')
    })
  })

  describe('error path', () => {
    it('redirects to /auth/error when exchange returns an error', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: new Error('OAuthError') })

      await GET(makeRequest('http://localhost:3000/auth/callback?code=bad_code'))

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('bad_code')
      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/auth/error')
    })
  })

  describe('missing code path', () => {
    it('redirects to /auth/error and skips exchange when no code param', async () => {
      await GET(makeRequest('http://localhost:3000/auth/callback'))

      expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/auth/error')
    })
  })
})

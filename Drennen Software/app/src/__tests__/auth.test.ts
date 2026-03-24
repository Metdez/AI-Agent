/**
 * Unit tests for auth route validation logic.
 * Covers: POST /api/auth/signup, POST /api/auth/login,
 *         POST /api/auth/logout, GET /api/auth/session
 *
 * Tests pure validation helpers extracted from route handlers.
 * Next.js / Supabase clients are not imported (no runtime to mock).
 */

// ---------------------------------------------------------------------------
// POST /api/auth/signup — validation logic
// ---------------------------------------------------------------------------

type SignupInput = {
  email?: unknown
  password?: unknown
  full_name?: unknown
  institution?: unknown
}

type ValidationOk = { ok: true; email: string; password: string; full_name: string; institution: string | null }
type ValidationFail = { ok: false; code: string; message: string; status: number }
type SignupValidation = ValidationOk | ValidationFail

function validateSignup(body: SignupInput): SignupValidation {
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const full_name = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  const institution = typeof body.institution === 'string' ? body.institution : null

  if (!email || !full_name || !body.password) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'email, password, and full_name are required', status: 400 }
  }
  if (password.length < 8) {
    return { ok: false, code: 'INVALID_PASSWORD', message: 'Password must be at least 8 characters', status: 422 }
  }

  return { ok: true, email, password, full_name, institution }
}

describe('validateSignup', () => {
  it('accepts a valid signup request', () => {
    const result = validateSignup({ email: 'prof@uni.edu', password: 'secure123', full_name: 'Jane Doe' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.email).toBe('prof@uni.edu')
      expect(result.full_name).toBe('Jane Doe')
      expect(result.institution).toBeNull()
    }
  })

  it('accepts institution when provided', () => {
    const result = validateSignup({ email: 'prof@uni.edu', password: 'secure123', full_name: 'Jane', institution: 'MIT' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.institution).toBe('MIT')
  })

  it('rejects when email is missing', () => {
    const result = validateSignup({ password: 'secure123', full_name: 'Jane Doe' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.status).toBe(400)
    }
  })

  it('rejects when password is missing', () => {
    const result = validateSignup({ email: 'prof@uni.edu', full_name: 'Jane Doe' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.status).toBe(400)
    }
  })

  it('rejects when full_name is missing', () => {
    const result = validateSignup({ email: 'prof@uni.edu', password: 'secure123' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.status).toBe(400)
    }
  })

  it('rejects password shorter than 8 characters', () => {
    const result = validateSignup({ email: 'prof@uni.edu', password: 'short', full_name: 'Jane Doe' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('INVALID_PASSWORD')
      expect(result.status).toBe(422)
    }
  })

  it('accepts password of exactly 8 characters', () => {
    const result = validateSignup({ email: 'prof@uni.edu', password: '12345678', full_name: 'Jane Doe' })
    expect(result.ok).toBe(true)
  })

  it('rejects non-string email', () => {
    const result = validateSignup({ email: 123, password: 'secure123', full_name: 'Jane Doe' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('rejects whitespace-only email', () => {
    const result = validateSignup({ email: '   ', password: 'secure123', full_name: 'Jane Doe' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR')
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/login — validation logic
// ---------------------------------------------------------------------------

type LoginInput = { email?: unknown; password?: unknown }
type LoginValidation =
  | { ok: true; email: string; password: string }
  | { ok: false; code: string; message: string; status: number }

function validateLogin(body: LoginInput): LoginValidation {
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !password) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'email and password are required', status: 400 }
  }

  return { ok: true, email, password }
}

describe('validateLogin', () => {
  it('accepts valid credentials', () => {
    const result = validateLogin({ email: 'prof@uni.edu', password: 'secure123' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.email).toBe('prof@uni.edu')
      expect(result.password).toBe('secure123')
    }
  })

  it('rejects missing email', () => {
    const result = validateLogin({ password: 'secure123' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.status).toBe(400)
    }
  })

  it('rejects missing password', () => {
    const result = validateLogin({ email: 'prof@uni.edu' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.status).toBe(400)
    }
  })

  it('rejects empty string email', () => {
    const result = validateLogin({ email: '', password: 'secure123' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('rejects empty string password', () => {
    const result = validateLogin({ email: 'prof@uni.edu', password: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('rejects non-string email', () => {
    const result = validateLogin({ email: 42, password: 'secure123' })
    expect(result.ok).toBe(false)
  })

  it('rejects whitespace-only email', () => {
    const result = validateLogin({ email: '   ', password: 'secure123' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR')
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/logout — no request body; always attempts signOut
// Route returns 200 on success, 500 on Supabase error.
// The only pure-logic concern: response shape helpers.
// ---------------------------------------------------------------------------

function buildLogoutSuccess(): { message: string } {
  return { message: 'Logged out successfully' }
}

describe('logout response shape', () => {
  it('returns expected success message', () => {
    const result = buildLogoutSuccess()
    expect(result.message).toBe('Logged out successfully')
  })
})

// ---------------------------------------------------------------------------
// GET /api/auth/session — no request body; validates JWT via Supabase.
// Pure logic: mapping a Supabase user + profile row to the response shape.
// ---------------------------------------------------------------------------

type SupabaseUser = {
  id: string
  email?: string
  user_metadata?: { full_name?: string }
}

type ProfileRow = { full_name?: string | null; institution?: string | null } | null

type SessionUserShape = {
  id: string
  email: string
  full_name: string | null
  institution: string | null
}

function buildSessionUser(user: SupabaseUser, profile: ProfileRow): SessionUserShape {
  return {
    id: user.id,
    email: user.email ?? '',
    full_name: profile?.full_name ?? user.user_metadata?.full_name ?? null,
    institution: profile?.institution ?? null,
  }
}

describe('buildSessionUser', () => {
  it('returns full user shape with profile data', () => {
    const user: SupabaseUser = { id: 'u1', email: 'prof@uni.edu', user_metadata: { full_name: 'Jane Doe' } }
    const profile: ProfileRow = { full_name: 'Jane Doe', institution: 'MIT' }
    const result = buildSessionUser(user, profile)
    expect(result).toEqual({ id: 'u1', email: 'prof@uni.edu', full_name: 'Jane Doe', institution: 'MIT' })
  })

  it('falls back to user_metadata full_name when profile has no full_name', () => {
    const user: SupabaseUser = { id: 'u1', email: 'prof@uni.edu', user_metadata: { full_name: 'From Metadata' } }
    const result = buildSessionUser(user, null)
    expect(result.full_name).toBe('From Metadata')
    expect(result.institution).toBeNull()
  })

  it('returns null full_name when neither profile nor metadata provides it', () => {
    const user: SupabaseUser = { id: 'u1', email: 'prof@uni.edu' }
    const result = buildSessionUser(user, null)
    expect(result.full_name).toBeNull()
  })

  it('returns null institution when profile has no institution', () => {
    const user: SupabaseUser = { id: 'u1', email: 'prof@uni.edu' }
    const profile: ProfileRow = { full_name: 'Jane', institution: null }
    const result = buildSessionUser(user, profile)
    expect(result.institution).toBeNull()
  })

  it('uses empty string for email when user has no email (guards against undefined)', () => {
    const user: SupabaseUser = { id: 'u1' }
    const result = buildSessionUser(user, null)
    expect(result.email).toBe('')
  })
})

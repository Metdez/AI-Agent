import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

/**
 * GET /auth/callback
 *
 * OAuth authorization code exchange for Supabase Google provider.
 * Called automatically by Supabase after the Google OAuth redirect chain
 * completes. The browser arrives here with a short-lived PKCE code.
 *
 * - Validates the `next` param is a relative path (open-redirect guard per ADR-002).
 * - Exchanges the PKCE code for a Supabase session via `exchangeCodeForSession`.
 * - On success: HTTP 302 → `safeNext`.
 * - On failure (missing code, exchange error): HTTP 302 → `/auth/error`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  // Open-redirect guard: only accept paths that start with '/' and are not protocol-relative (//)
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  // Missing code — cannot proceed
  if (!code) {
    return NextResponse.redirect(new URL('/auth/error', origin))
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored in Server Component context
          }
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL('/auth/error', origin))
  }

  return NextResponse.redirect(new URL(safeNext, origin))
}

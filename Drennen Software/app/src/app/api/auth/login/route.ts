import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { jsonSuccess, jsonError } from '@/lib/types'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json()
  const { email, password } = body

  if (!email || !password) {
    return jsonError('VALIDATION_ERROR', 'email and password are required', 400)
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

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return jsonError('INVALID_CREDENTIALS', 'Invalid email or password', 401)
  }

  return jsonSuccess({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    user: {
      id: data.user.id,
      email: data.user.email!,
      full_name: data.user.user_metadata?.full_name || null,
    },
  })
}

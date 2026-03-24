import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { jsonSuccess, jsonError } from '@/lib/types'

export const runtime = 'nodejs'

export async function POST() {
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

  const { error } = await supabase.auth.signOut()

  if (error) {
    return jsonError('LOGOUT_ERROR', error.message, 500)
  }

  return jsonSuccess({ message: 'Logged out successfully' })
}

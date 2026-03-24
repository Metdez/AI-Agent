import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { jsonSuccess, jsonError } from '@/lib/types'

export const runtime = 'nodejs'

export async function GET() {
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

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return jsonError('UNAUTHORIZED', 'Not authenticated', 401)
  }

  // Fetch profile for institution
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, institution')
    .eq('id', user.id)
    .single()

  return jsonSuccess({
    user: {
      id: user.id,
      email: user.email!,
      full_name: profile?.full_name || user.user_metadata?.full_name || null,
      institution: profile?.institution || null,
    },
  })
}

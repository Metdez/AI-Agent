import { createClient } from '@supabase/supabase-js'
import { jsonSuccess, jsonError } from '@/lib/types'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json()
  const { email, password, full_name, institution } = body

  if (!email || !password || !full_name) {
    return jsonError('VALIDATION_ERROR', 'email, password, and full_name are required', 400)
  }

  if (typeof password !== 'string' || password.length < 8) {
    return jsonError('INVALID_PASSWORD', 'Password must be at least 8 characters', 422)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, institution: institution || null },
  })

  if (error) {
    if (error.message.includes('already been registered') || error.message.includes('already exists')) {
      return jsonError('EMAIL_IN_USE', 'A user with this email already exists', 409)
    }
    return jsonError('SIGNUP_ERROR', error.message, 400)
  }

  return jsonSuccess(
    {
      user_id: data.user.id,
      email: data.user.email,
      message: 'Account created successfully.',
    },
    201
  )
}

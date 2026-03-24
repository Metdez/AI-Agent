import { createClient } from '@/lib/supabase/server'
import { jsonSuccess, jsonError } from '@/lib/types'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return jsonError('UNAUTHORIZED', 'Not authenticated', 401)
  }

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const status = searchParams.get('status')

  let query = supabase
    .from('sessions')
    .select('id, speaker_name, status, zip_filename, created_at, completed_at', { count: 'exact' })
    .eq('professor_id', user.id)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) {
    return jsonError('DB_ERROR', error.message, 500)
  }

  return jsonSuccess({
    sessions: data ?? [],
    total: count ?? 0,
    page,
    limit,
  })
}

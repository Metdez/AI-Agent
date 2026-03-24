import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { jsonSuccess, jsonError } from '@/lib/types'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return jsonError('UNAUTHORIZED', 'Not authenticated', 401)
  }

  // Verify session belongs to user and fetch storage path
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, status, zip_storage_path')
    .eq('id', sessionId)
    .eq('professor_id', user.id)
    .single()

  if (sessionError || !session) {
    return jsonError('NOT_FOUND', 'Session not found', 404)
  }

  // Verify the ZIP object exists in Supabase Storage (admin client bypasses RLS)
  if (session.zip_storage_path) {
    const admin = createAdminClient()
    const { data: fileList, error: storageError } = await admin.storage
      .from('speaker-zips')
      .list(session.zip_storage_path.split('/').slice(0, -1).join('/'), {
        search: session.zip_storage_path.split('/').pop(),
      })

    if (storageError || !fileList || fileList.length === 0) {
      return jsonError('STORAGE_ERROR', 'Upload not found in storage — please re-upload the file', 422)
    }
  }

  // Parse optional body
  let actualSize: number | undefined
  try {
    const body = await request.json() as { actual_size_bytes?: unknown }
    if (typeof body.actual_size_bytes === 'number') {
      actualSize = body.actual_size_bytes
    }
  } catch {
    // body is optional — ignore parse errors
  }

  const updates: Record<string, unknown> = {}
  if (actualSize !== undefined) {
    updates.zip_size_bytes = actualSize
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('sessions').update(updates).eq('id', sessionId)
  }

  return jsonSuccess({
    session_id: sessionId,
    status: 'pending' as const,
    message: 'Upload confirmed. Processing will begin shortly.',
  })
}

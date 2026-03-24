import { createClient } from '@/lib/supabase/server'
import { jsonSuccess, jsonError } from '@/lib/types'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
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

  // Fetch session — RLS ensures professor_id = auth.uid(), so a miss = not found or not owned
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, speaker_name, status, zip_filename, zip_size_bytes, error_message, created_at, completed_at')
    .eq('id', sessionId)
    .eq('professor_id', user.id)
    .single()

  if (sessionError || !session) {
    return jsonError('NOT_FOUND', 'Session not found', 404)
  }

  // Fetch uploaded files summary
  const { data: files, error: filesError } = await supabase
    .from('uploaded_files')
    .select('id, filename, file_type, size_bytes, extraction_status, skip_reason, char_count')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (filesError) {
    return jsonError('DB_ERROR', filesError.message, 500)
  }

  return jsonSuccess({
    id: session.id,
    speaker_name: session.speaker_name,
    status: session.status,
    zip_filename: session.zip_filename,
    zip_size_bytes: session.zip_size_bytes,
    error_message: session.error_message,
    created_at: session.created_at,
    completed_at: session.completed_at,
    uploaded_files: files ?? [],
  })
}

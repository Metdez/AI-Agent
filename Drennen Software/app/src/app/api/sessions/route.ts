import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { jsonSuccess, jsonError } from '@/lib/types'

export const runtime = 'nodejs'

const MAX_ZIP_BYTES = 26214400 // 25 MB
const SIGNED_URL_EXPIRY = 600  // 10 minutes

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return jsonError('UNAUTHORIZED', 'Not authenticated', 401)
  }

  let body: { speaker_name?: unknown; zip_filename?: unknown; zip_size_bytes?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError('VALIDATION_ERROR', 'Invalid JSON body', 400)
  }

  const speaker_name = typeof body.speaker_name === 'string' ? body.speaker_name.trim() : ''
  const zip_filename = typeof body.zip_filename === 'string' ? body.zip_filename.trim() : ''
  const zip_size_bytes = typeof body.zip_size_bytes === 'number' ? body.zip_size_bytes : -1

  if (!speaker_name || speaker_name.length > 200) {
    return jsonError('VALIDATION_ERROR', 'speaker_name is required and must be 1–200 characters', 400)
  }
  if (!zip_filename) {
    return jsonError('VALIDATION_ERROR', 'zip_filename is required', 400)
  }
  if (zip_size_bytes < 0 || !Number.isInteger(zip_size_bytes)) {
    return jsonError('VALIDATION_ERROR', 'zip_size_bytes must be a non-negative integer', 400)
  }
  if (zip_size_bytes > MAX_ZIP_BYTES) {
    return jsonError('FILE_TOO_LARGE', 'File exceeds the 25 MB limit', 422)
  }

  // Insert session row
  const { data: session, error: insertError } = await supabase
    .from('sessions')
    .insert({
      professor_id: user.id,
      speaker_name,
      zip_filename,
      zip_size_bytes,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertError || !session) {
    return jsonError('DB_ERROR', insertError?.message ?? 'Failed to create session', 500)
  }

  const sessionId = session.id
  const uploadPath = `${user.id}/${sessionId}/${zip_filename}`

  // Generate signed upload URL (admin client, bypasses RLS on storage)
  const admin = createAdminClient()
  const { data: signedData, error: signedError } = await admin.storage
    .from('speaker-zips')
    .createSignedUploadUrl(uploadPath)

  if (signedError || !signedData) {
    // Roll back session row
    await supabase.from('sessions').delete().eq('id', sessionId)
    return jsonError('STORAGE_ERROR', 'Failed to generate upload URL', 500)
  }

  // Store the upload path so extract route can download later
  await supabase
    .from('sessions')
    .update({ zip_storage_path: uploadPath })
    .eq('id', sessionId)

  const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY * 1000).toISOString()

  return jsonSuccess(
    {
      session_id: sessionId,
      upload_url: signedData.signedUrl,
      upload_path: uploadPath,
      expires_at: expiresAt,
    },
    201
  )
}

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
  const rawPage = parseInt(searchParams.get('page') ?? '1', 10)
  const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage)
  const rawLimit = parseInt(searchParams.get('limit') ?? '20', 10)
  const limit = Math.min(50, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit))
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

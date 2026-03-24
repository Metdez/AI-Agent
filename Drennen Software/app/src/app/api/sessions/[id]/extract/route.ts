import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { jsonSuccess, jsonError } from '@/lib/types'
import JSZip from 'jszip'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>
import mammoth from 'mammoth'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB per file

async function extractText(
  filename: string,
  buffer: Buffer
): Promise<{ text: string | null; skipped: boolean; skip_reason: string | null }> {
  const lower = filename.toLowerCase()

  if (lower.endsWith('.pdf')) {
    try {
      const result = await pdfParse(buffer)
      return { text: result.text, skipped: false, skip_reason: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // Password-protected PDFs throw an error referencing "password"
      if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('encrypt')) {
        return { text: null, skipped: true, skip_reason: 'password_protected' }
      }
      return { text: null, skipped: true, skip_reason: `pdf_parse_error: ${msg}` }
    }
  }

  if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    try {
      const result = await mammoth.extractRawText({ buffer })
      return { text: result.value, skipped: false, skip_reason: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { text: null, skipped: true, skip_reason: `docx_parse_error: ${msg}` }
    }
  }

  if (lower.endsWith('.txt')) {
    return { text: buffer.toString('utf-8'), skipped: false, skip_reason: null }
  }

  return { text: null, skipped: true, skip_reason: 'unsupported_file_type' }
}

export async function POST(
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

  // Fetch session owned by this user
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, status, zip_storage_path, speaker_name')
    .eq('id', sessionId)
    .eq('professor_id', user.id)
    .single()

  if (sessionError || !session) {
    return jsonError('NOT_FOUND', 'Session not found', 404)
  }

  if (session.status !== 'pending') {
    return jsonError('WRONG_STATUS', `Session status is '${session.status}', expected 'pending'`, 409)
  }

  // Set status = extracting
  const { error: updateErr } = await supabase
    .from('sessions')
    .update({ status: 'extracting' })
    .eq('id', sessionId)

  if (updateErr) {
    return jsonError('DB_ERROR', updateErr.message, 500)
  }

  const admin = createAdminClient()

  try {
    // Download ZIP from Supabase Storage (admin client bypasses RLS)
    const { data: zipData, error: downloadError } = await admin.storage
      .from('speaker-zips')
      .download(session.zip_storage_path)

    if (downloadError || !zipData) {
      await admin.from('sessions').update({ status: 'failed', error_message: 'Failed to download ZIP' }).eq('id', sessionId)
      return jsonError('EXTRACTION_FAILED', 'Failed to download ZIP from storage', 500)
    }

    const zipBuffer = Buffer.from(await zipData.arrayBuffer())

    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(zipBuffer)
    } catch {
      await admin.from('sessions').update({ status: 'failed', error_message: 'Corrupt or invalid ZIP file' }).eq('id', sessionId)
      return jsonError('CORRUPT_ZIP', 'The ZIP file is corrupt or invalid', 422)
    }

    const entries = Object.entries(zip.files).filter(([, f]) => !f.dir)

    const files_found = entries.length
    let files_extracted = 0
    let files_skipped = 0
    let total_chars = 0

    for (const [filename, zipEntry] of entries) {
      const rawBuffer = Buffer.from(await zipEntry.async('arraybuffer'))

      // Enforce 10 MB per file
      if (rawBuffer.byteLength > MAX_FILE_BYTES) {
        await admin.from('uploaded_files').insert({
          session_id: sessionId,
          professor_id: user.id,
          filename,
          file_type: filename.split('.').pop() ?? 'unknown',
          size_bytes: rawBuffer.byteLength,
          extraction_status: 'skipped',
          skip_reason: 'file_too_large',
        })
        files_skipped++
        continue
      }

      const { text, skipped, skip_reason } = await extractText(filename, rawBuffer)

      if (skipped || text === null) {
        await admin.from('uploaded_files').insert({
          session_id: sessionId,
          professor_id: user.id,
          filename,
          file_type: filename.split('.').pop() ?? 'unknown',
          size_bytes: rawBuffer.byteLength,
          extraction_status: 'skipped',
          skip_reason,
        })
        files_skipped++
      } else {
        const char_count = text.length
        total_chars += char_count
        await admin.from('uploaded_files').insert({
          session_id: sessionId,
          professor_id: user.id,
          filename,
          file_type: filename.split('.').pop() ?? 'unknown',
          size_bytes: rawBuffer.byteLength,
          extracted_text: text,
          char_count,
          extraction_status: 'completed',
        })
        files_extracted++
      }
    }

    // Delete ZIP from Storage after successful extraction
    await admin.storage.from('speaker-zips').remove([session.zip_storage_path])

    // Set status back to pending (ready for generation)
    await admin
      .from('sessions')
      .update({ status: 'pending' })
      .eq('id', sessionId)

    return jsonSuccess({
      session_id: sessionId,
      status: 'pending' as const,
      files_found,
      files_extracted,
      files_skipped,
      total_chars,
      message: `Extracted ${files_extracted} of ${files_found} files successfully`,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    await admin
      .from('sessions')
      .update({ status: 'failed', error_message: msg })
      .eq('id', sessionId)
    return jsonError('EXTRACTION_FAILED', `Extraction failed: ${msg}`, 500)
  }
}

import { createClient } from '@/lib/supabase/server'
import { jsonSuccess, jsonError, type SectionKey } from '@/lib/types'

export const runtime = 'nodejs'

// Must match the order defined in the generate route
const SECTION_KEYS: SectionKey[] = [
  'executive_summary',
  'speaker_biography',
  'key_accomplishments',
  'core_messages',
  'areas_of_expertise',
  'speaking_style',
  'audience_considerations',
  'qa_preparation',
  'logistical_notes',
  'online_presence',
]

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

  // Verify session exists and belongs to this user
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, speaker_name, created_at, status')
    .eq('id', sessionId)
    .eq('professor_id', user.id)
    .single()

  if (sessionError || !session) {
    return jsonError('NOT_FOUND', 'Session not found', 404)
  }

  if (session.status !== 'completed') {
    return jsonError('NOT_READY', 'Output not yet generated', 404)
  }

  // Fetch all generated sections for this session
  const { data: rows, error: outputError } = await supabase
    .from('generated_outputs')
    .select('section_order, section_key, section_title, content')
    .eq('session_id', sessionId)

  if (outputError) {
    return jsonError('DB_ERROR', outputError.message, 500)
  }

  if (!rows || rows.length === 0) {
    return jsonError('NOT_FOUND', 'Output not yet generated', 404)
  }

  // Sort sections by SECTION_KEYS order (canonical ordering)
  const sectionIndexMap = new Map(SECTION_KEYS.map((key, i) => [key, i]))
  const sections = [...rows].sort((a, b) => {
    const ai = sectionIndexMap.get(a.section_key as SectionKey) ?? a.section_order
    const bi = sectionIndexMap.get(b.section_key as SectionKey) ?? b.section_order
    return ai - bi
  })

  return jsonSuccess({
    session_id: session.id,
    speaker_name: session.speaker_name,
    sections,
    created_at: session.created_at,
  })
}

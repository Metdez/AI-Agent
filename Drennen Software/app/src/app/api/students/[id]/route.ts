import { createClient } from '@/lib/supabase/server'
import { jsonSuccess, jsonError, type StudentDetail } from '@/lib/types'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studentId } = await params

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return jsonError('UNAUTHORIZED', 'Not authenticated', 401)
  }

  // Fetch student (RLS ensures ownership)
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, display_name')
    .eq('id', studentId)
    .single()

  if (studentError || !student) {
    return jsonError('STUDENT_NOT_FOUND', 'Student not found', 404)
  }

  // Fetch analysis
  const { data: analysis } = await supabase
    .from('student_analyses')
    .select('analysis_text, interest_tags, generated_at')
    .eq('student_id', studentId)
    .single()

  // Fetch questions with session context
  const { data: questions, error: qError } = await supabase
    .from('student_questions')
    .select(`
      question_text,
      created_at,
      sessions(id, speaker_name, created_at)
    `)
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })

  if (qError) {
    return jsonError('DB_ERROR', qError.message, 500)
  }

  // Group questions by session
  const sessionMap: Record<string, {
    session_id: string
    speaker_name: string
    created_at: string
    questions: string[]
  }> = {}

  for (const q of questions ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sess = q.sessions as any
    const sessionId: string = sess?.id ?? 'unknown'
    if (!sessionMap[sessionId]) {
      sessionMap[sessionId] = {
        session_id: sessionId,
        speaker_name: sess?.speaker_name ?? 'Unknown Speaker',
        created_at: sess?.created_at ?? q.created_at,
        questions: [],
      }
    }
    sessionMap[sessionId].questions.push(q.question_text)
  }

  const result: StudentDetail = {
    id: student.id,
    display_name: student.display_name,
    analysis: analysis
      ? {
          analysis_text: analysis.analysis_text,
          interest_tags: analysis.interest_tags,
          generated_at: analysis.generated_at,
        }
      : null,
    sessions: Object.values(sessionMap).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ),
  }

  return jsonSuccess(result)
}

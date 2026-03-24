import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { jsonSuccess, jsonError } from '@/lib/types'
import { runAnalysisChain, type QuestionWithContext } from '@/lib/langchain/analysis'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studentId } = await params

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return jsonError('UNAUTHORIZED', 'Not authenticated', 401)
  }

  // Verify student belongs to this professor (RLS does this automatically)
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, display_name')
    .eq('id', studentId)
    .single()

  if (studentError || !student) {
    return jsonError('STUDENT_NOT_FOUND', 'Student not found', 404)
  }

  // Fetch question history with session context
  const { data: questions } = await supabase
    .from('student_questions')
    .select('question_text, sessions(speaker_name)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })

  if (!questions || questions.length === 0) {
    return jsonError('NO_QUESTIONS', 'Student has no questions stored', 400)
  }

  const questionsWithContext: QuestionWithContext[] = questions.map(q => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    speaker_name: (q.sessions as any)?.speaker_name ?? 'Unknown Speaker',
    question: q.question_text,
  }))

  try {
    const analysis = await runAnalysisChain(student.display_name, questionsWithContext)

    const admin = createAdminClient()
    await admin.from('student_analyses').upsert(
      {
        student_id: studentId,
        professor_id: user.id,
        analysis_text: analysis.analysis_text,
        interest_tags: analysis.interest_tags,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id' }
    )

    return jsonSuccess({
      analysis_text: analysis.analysis_text,
      interest_tags: analysis.interest_tags,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[reanalyze] analysis chain failed:', msg)
    return jsonError('GEMINI_ANALYSIS_ERROR', msg, 500)
  }
}

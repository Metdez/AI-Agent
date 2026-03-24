import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { jsonSuccess, jsonError } from '@/lib/types'
import { runExtractionChain } from '@/lib/langchain/extraction'
import { runAnalysisChain, type QuestionWithContext } from '@/lib/langchain/analysis'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return jsonError('UNAUTHORIZED', 'Not authenticated', 401)
  }

  const admin = createAdminClient()

  // Verify session belongs to this professor
  const { data: session } = await supabase
    .from('sessions')
    .select('id, professor_id')
    .eq('id', sessionId)
    .eq('professor_id', user.id)
    .single()

  if (!session) {
    return jsonError('SESSION_NOT_FOUND', 'Session not found', 404)
  }

  // Mark as pending
  await admin
    .from('sessions')
    .update({ student_analysis_status: 'pending' })
    .eq('id', sessionId)

  // Fetch extracted text from all files
  const { data: files, error: filesError } = await supabase
    .from('uploaded_files')
    .select('extracted_text')
    .eq('session_id', sessionId)
    .eq('extraction_status', 'completed')

  if (filesError || !files || files.length === 0) {
    await admin
      .from('sessions')
      .update({ student_analysis_status: 'completed' })
      .eq('id', sessionId)
    return jsonSuccess({ students_found: 0, questions_stored: 0 })
  }

  const combinedText = files
    .map(f => f.extracted_text ?? '')
    .join('\n\n')

  // Run extraction chain
  let pairs: Array<{ student_name: string; question: string }>
  try {
    const result = await runExtractionChain(combinedText)
    pairs = result.pairs
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[analyze-students] extraction chain failed:', msg)
    await admin
      .from('sessions')
      .update({ student_analysis_status: 'failed' })
      .eq('id', sessionId)
    return jsonError('GEMINI_EXTRACTION_ERROR', msg, 500)
  }

  if (pairs.length === 0) {
    await admin
      .from('sessions')
      .update({ student_analysis_status: 'completed' })
      .eq('id', sessionId)
    return jsonSuccess({ students_found: 0, questions_stored: 0 })
  }

  // Upsert students (one row per unique name per professor)
  const uniqueNames = [...new Set(pairs.map(p => p.student_name))]
  const studentIdMap: Record<string, string> = {}

  for (const name of uniqueNames) {
    // Use upsert with ignoreDuplicates so re-runs don't fail on existing students
    await admin
      .from('students')
      .upsert(
        { professor_id: user.id, display_name: name },
        { onConflict: 'professor_id,display_name', ignoreDuplicates: true }
      )

    // Fetch the student row (guaranteed to exist after upsert)
    const { data: student } = await admin
      .from('students')
      .select('id')
      .eq('professor_id', user.id)
      .eq('display_name', name)
      .single()

    if (student) {
      studentIdMap[name] = student.id
    }
  }

  // Idempotency: delete existing questions for this session, then re-insert
  await admin
    .from('student_questions')
    .delete()
    .eq('session_id', sessionId)

  const questionsToInsert = pairs
    .filter(p => studentIdMap[p.student_name])
    .map(p => ({
      student_id: studentIdMap[p.student_name],
      session_id: sessionId,
      professor_id: user.id,
      question_text: p.question,
    }))

  await admin.from('student_questions').insert(questionsToInsert)

  // Fetch full question history for each student across ALL sessions
  const analysisPromises = Object.entries(studentIdMap).map(async ([name, studentId]) => {
    const { data: allQuestions } = await admin
      .from('student_questions')
      .select('question_text, sessions(speaker_name)')
      .eq('student_id', studentId)

    const questionsWithContext: QuestionWithContext[] = (allQuestions ?? []).map(q => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      speaker_name: (q.sessions as any)?.speaker_name ?? 'Unknown Speaker',
      question: q.question_text,
    }))

    if (questionsWithContext.length === 0) return

    try {
      const analysis = await runAnalysisChain(name, questionsWithContext)

      // Upsert analysis
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
    } catch (err: unknown) {
      console.error(`[analyze-students] analysis failed for ${name}:`, err)
      // Continue — other students should not be blocked
    }
  })

  // Run all analysis chains in parallel; partial failure is acceptable
  await Promise.allSettled(analysisPromises)

  // Mark session complete
  await admin
    .from('sessions')
    .update({ student_analysis_status: 'completed' })
    .eq('id', sessionId)

  return jsonSuccess({
    students_found: uniqueNames.length,
    questions_stored: questionsToInsert.length,
  })
}

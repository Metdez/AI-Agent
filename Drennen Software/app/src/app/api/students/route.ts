import { createClient } from '@/lib/supabase/server'
import { jsonSuccess, jsonError, type StudentSummary } from '@/lib/types'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return jsonError('UNAUTHORIZED', 'Not authenticated', 401)
  }

  // Fetch students with question count and latest interest tag
  const { data: students, error } = await supabase
    .from('students')
    .select(`
      id,
      display_name,
      student_questions(count),
      student_analyses(interest_tags)
    `)
    .eq('professor_id', user.id)
    .order('display_name', { ascending: true })

  if (error) {
    return jsonError('DB_ERROR', error.message, 500)
  }

  // Fetch session counts separately (COUNT DISTINCT is not directly supported in client)
  const { data: sessionCounts } = await supabase
    .from('student_questions')
    .select('student_id, session_id')
    .eq('professor_id', user.id)

  // Build session count map
  const sessionCountMap: Record<string, Set<string>> = {}
  for (const row of sessionCounts ?? []) {
    if (!sessionCountMap[row.student_id]) {
      sessionCountMap[row.student_id] = new Set()
    }
    sessionCountMap[row.student_id].add(row.session_id)
  }

  const result: StudentSummary[] = (students ?? [])
    // Filter out students with no questions (orphaned from failed Phase 3)
    .filter(s => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const count = (s.student_questions as any)?.[0]?.count ?? 0
      return count > 0
    })
    .map(s => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const questionCount = (s.student_questions as any)?.[0]?.count ?? 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tags: string[] = (s.student_analyses as any)?.[0]?.interest_tags ?? []

      return {
        id: s.id,
        display_name: s.display_name,
        question_count: Number(questionCount),
        session_count: sessionCountMap[s.id]?.size ?? 0,
        top_interest: tags[0] ?? null,
      }
    })

  return jsonSuccess(result)
}

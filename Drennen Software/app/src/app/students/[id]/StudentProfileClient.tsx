'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { StudentDetail } from '@/lib/types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export default function StudentProfileClient({ studentId }: { studentId: string }) {
  const [data, setData] = useState<StudentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reanalyzing, setReanalyzing] = useState(false)

  const fetchProfile = useCallback(async () => {
    const res = await fetch(`/api/students/${studentId}`)
    const json = await res.json()
    if (json.error) throw new Error(json.error.message as string)
    setData(json.data as StudentDetail)
  }, [studentId])

  useEffect(() => {
    fetchProfile()
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [fetchProfile])

  const handleReanalyze = async () => {
    setReanalyzing(true)
    try {
      const res = await fetch(`/api/students/${studentId}/reanalyze`, { method: 'POST' })
      const json = await res.json()
      if (json.error) throw new Error(json.error.message as string)
      // Refresh profile data to show new analysis
      await fetchProfile()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Re-analysis failed')
    } finally {
      setReanalyzing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div
          className="w-8 h-8 rounded-full border-4 animate-spin"
          style={{ borderColor: '#f36f21', borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-sm mb-4">{error ?? 'Student not found'}</p>
          <Link href="/students" className="text-sm text-purple-700 hover:underline">← Back to Students</Link>
        </div>
      </div>
    )
  }

  const totalQuestions = data.sessions.reduce((sum, s) => sum + s.questions.length, 0)

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: '#faf9f6', fontFamily: "'Source Sans 3', Arial, sans-serif" }}
    >
      <div className="h-1 w-full" style={{ backgroundColor: '#f36f21' }} />

      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <nav className="text-xs text-gray-400 mb-1 flex items-center gap-1.5">
            <Link href="/students" className="hover:text-gray-600 transition-colors">Students</Link>
            <span>›</span>
            <span className="text-gray-500">{data.display_name}</span>
          </nav>
          <div className="flex items-center justify-between">
            <div>
              <h1
                className="text-xl font-bold text-gray-900"
                style={{ fontFamily: "'Lora', Georgia, serif" }}
              >
                {data.display_name}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {totalQuestions} questions · {data.sessions.length} sessions
              </p>
            </div>
            <button
              onClick={handleReanalyze}
              disabled={reanalyzing}
              className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors disabled:opacity-40"
              style={{ borderColor: '#542785', color: '#542785' }}
            >
              {reanalyzing ? 'Analyzing…' : 'Re-run Analysis'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* AI Analysis Block */}
        <div
          className="rounded-xl p-6 border"
          style={{ backgroundColor: '#0f172a', borderColor: '#1e3a5f' }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: '#4a9eff' }}
          >
            AI Analysis
          </div>

          {data.analysis ? (
            <>
              <p className="text-gray-300 text-sm leading-relaxed mb-4">
                {data.analysis.analysis_text}
              </p>
              <div className="flex flex-wrap gap-2">
                {data.analysis.interest_tags.map(tag => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full text-xs font-medium"
                    style={{ backgroundColor: '#1e3a5f', color: '#90caf9' }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-3">
                Generated {formatDate(data.analysis.generated_at)}
              </p>
            </>
          ) : (
            <div className="space-y-2">
              <div className="h-3 bg-gray-800 rounded animate-pulse w-full" />
              <div className="h-3 bg-gray-800 rounded animate-pulse w-5/6" />
              <div className="h-3 bg-gray-800 rounded animate-pulse w-4/6" />
              <p className="text-xs text-gray-600 mt-3">Analysis generating…</p>
            </div>
          )}
        </div>

        {/* Questions by Session */}
        <div>
          <h2
            className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4"
          >
            Questions by Session
          </h2>
          <div className="space-y-4">
            {data.sessions.map(session => (
              <div
                key={session.session_id}
                className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm"
              >
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <span className="font-semibold text-sm text-gray-800">
                    {session.speaker_name}
                  </span>
                  <span className="text-xs text-gray-400">{formatDate(session.created_at)}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {session.questions.map((q, i) => (
                    <p key={i} className="px-5 py-3 text-sm text-gray-700 leading-relaxed">
                      {q}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

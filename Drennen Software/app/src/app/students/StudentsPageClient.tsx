'use client'

import { useState, useEffect } from 'react'
import type { StudentSummary } from '@/lib/types'

type SortKey = 'question_count' | 'session_count' | 'display_name'

export default function StudentsPageClient() {
  const [students, setStudents] = useState<StudentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('question_count')

  useEffect(() => {
    fetch('/api/students')
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error.message as string)
        setStudents(json.data as StudentSummary[])
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const sorted = [...students].sort((a, b) => {
    if (sortKey === 'display_name') return a.display_name.localeCompare(b.display_name)
    return b[sortKey] - a[sortKey]
  })

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: '#faf9f6', fontFamily: "'Source Sans 3', Arial, sans-serif" }}
    >
      <div className="h-1 w-full" style={{ backgroundColor: '#f36f21' }} />

      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <h1
            className="text-xl font-bold text-gray-900"
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          >
            Students
          </h1>
          {!loading && (
            <span className="text-sm text-gray-400">{students.length} students</span>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div
              className="w-8 h-8 rounded-full border-4 animate-spin"
              style={{ borderColor: '#f36f21', borderTopColor: 'transparent' }}
            />
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm">{error}</div>
        )}

        {!loading && !error && students.length === 0 && (
          <div className="text-center py-24 text-gray-400 text-sm">
            No students yet. Student profiles are created automatically after you process a session.
          </div>
        )}

        {!loading && !error && students.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Sort controls */}
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
              <span className="text-xs text-gray-400 uppercase tracking-widest">Sort by</span>
              {([
                ['question_count', 'Most Questions'],
                ['session_count', 'Most Sessions'],
                ['display_name', 'A–Z'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSortKey(key)}
                  className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                    sortKey === key
                      ? 'text-white'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                  style={sortKey === key ? { backgroundColor: '#542785' } : {}}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Table */}
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-widest">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-widest">Questions</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-widest">Sessions</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-widest">Top Interest</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, i) => (
                  <tr
                    key={s.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${
                      i === sorted.length - 1 ? 'border-b-0' : ''
                    }`}
                    onClick={() => window.location.href = `/students/${s.id}`}
                  >
                    <td className="px-5 py-4 font-semibold text-gray-900 text-sm">{s.display_name}</td>
                    <td className="px-5 py-4 text-gray-600 text-sm">{s.question_count}</td>
                    <td className="px-5 py-4 text-gray-600 text-sm">{s.session_count}</td>
                    <td className="px-5 py-4 text-sm">
                      {s.top_interest ? (
                        <span
                          className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: '#f3e8ff', color: '#542785' }}
                        >
                          {s.top_interest}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

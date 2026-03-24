'use client'

import { useState, useEffect, useCallback } from 'react'
import TopNav from '@/app/TopNav'
import type { SessionSummary, SessionStatus } from '@/lib/types'

function statusBadge(status: SessionStatus): { label: string; color: string; bg: string } {
  switch (status) {
    case 'pending':    return { label: 'Pending',    color: '#92400e', bg: '#fef3c7' }
    case 'extracting': return { label: 'Extracting', color: '#1e40af', bg: '#dbeafe' }
    case 'generating': return { label: 'Generating', color: '#6b21a8', bg: '#f3e8ff' }
    case 'completed':  return { label: 'Ready',      color: '#14532d', bg: '#dcfce7' }
    case 'failed':     return { label: 'Failed',     color: '#991b1b', bg: '#fee2e2' }
    default:           return { label: status,       color: '#374151', bg: '#f3f4f6' }
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function SessionCard({ session }: { session: SessionSummary }) {
  const { label, color, bg } = statusBadge(session.status)
  return (
    <a
      href={`/sessions/${session.id}`}
      className="block bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-5 group"
      style={{ borderLeft: '4px solid #f36f21' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-base truncate group-hover:text-orange-600 transition-colors"
              style={{ fontFamily: "'Lora', Georgia, serif" }}>
            {session.speaker_name}
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            {formatDate(session.created_at)}
            {session.zip_filename && <span className="ml-2 text-gray-300">· {session.zip_filename}</span>}
          </p>
        </div>
        <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color, backgroundColor: bg }}>
          {label}
        </span>
      </div>
    </a>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5" style={{ borderLeft: '4px solid #e5e7eb' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded animate-pulse w-3/5" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-1/4" />
        </div>
        <div className="h-5 w-14 bg-gray-100 rounded-full animate-pulse flex-shrink-0" />
      </div>
    </div>
  )
}

type DashboardState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; sessions: SessionSummary[]; total: number; page: number }

const LIMIT = 20

export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>({ phase: 'loading' })
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(json => {
      if (json.data?.user?.email) setUserEmail(json.data.user.email)
    }).catch(() => null)
  }, [])

  const fetchSessions = useCallback(async (p: number) => {
    setState({ phase: 'loading' })
    try {
      const res = await fetch(`/api/sessions?page=${p}&limit=${LIMIT}`)
      const json = await res.json()
      if (!res.ok || json.error) {
        setState({ phase: 'error', message: json.error?.message ?? 'Unable to load sessions.' })
        return
      }
      setState({ phase: 'ready', sessions: json.data.sessions, total: json.data.total, page: json.data.page })
    } catch {
      setState({ phase: 'error', message: 'Unable to connect. Please refresh the page.' })
    }
  }, [])

  useEffect(() => { fetchSessions(page) }, [page, fetchSessions])

  const totalPages = state.phase === 'ready' ? Math.ceil(state.total / LIMIT) : 1

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#faf9f6', fontFamily: "'Source Sans 3', Arial, sans-serif" }}>
      <div className="h-1 w-full" style={{ backgroundColor: '#f36f21' }} />
      <TopNav userEmail={userEmail} />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Lora', Georgia, serif" }}>
              Your Briefings
            </h1>
            {state.phase === 'ready' && state.total > 0 && (
              <p className="text-sm text-gray-400 mt-0.5">{state.total} session{state.total !== 1 ? 's' : ''} total</p>
            )}
          </div>
          <a href="/upload" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold hover:opacity-90"
             style={{ backgroundColor: '#f36f21' }}>
            <span>+</span><span>New Session</span>
          </a>
        </div>

        {state.phase === 'loading' && (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}</div>
        )}

        {state.phase === 'error' && (
          <div className="bg-white rounded-2xl border border-red-100 p-8 text-center shadow-sm">
            <div className="text-3xl mb-3">⚠️</div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Unable to Load Sessions</h2>
            <p className="text-sm text-gray-500 mb-5">{state.message}</p>
            <button onClick={() => fetchSessions(page)} className="px-5 py-2 rounded-lg text-white text-sm hover:opacity-90"
                    style={{ backgroundColor: '#f36f21' }}>Try Again</button>
          </div>
        )}

        {state.phase === 'ready' && state.sessions.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl mx-auto mb-5" style={{ backgroundColor: '#fff7ed' }}>📋</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2" style={{ fontFamily: "'Lora', Georgia, serif" }}>No briefings yet</h2>
            <p className="text-gray-500 text-sm mb-7 max-w-xs mx-auto leading-relaxed">
              Upload a speaker&apos;s documents to generate your first briefing.
            </p>
            <a href="/upload" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-semibold hover:opacity-90"
               style={{ backgroundColor: '#f36f21' }}>
              <span>+</span><span>Upload Speaker Documents</span>
            </a>
          </div>
        )}

        {state.phase === 'ready' && state.sessions.length > 0 && (
          <>
            <div className="space-y-3">
              {state.sessions.map(session => <SessionCard key={session.id} session={session} />)}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={state.page <= 1}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                  ← Previous
                </button>
                <span className="text-sm text-gray-400 px-2">Page {state.page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={state.page >= totalPages}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

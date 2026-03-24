'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import type { SessionDetail, GeneratedSection, GeneratedOutput } from '@/lib/types'

// ─── State Machine ────────────────────────────────────────────────────────────

type PageState =
  | { phase: 'loading' }
  | { phase: 'fetch_error'; message: string }
  | { phase: 'pending'; session: SessionDetail }
  | { phase: 'extracting'; session: SessionDetail }
  | { phase: 'generating'; session: SessionDetail; sections: GeneratedSection[] }
  | { phase: 'completed'; session: SessionDetail; output: GeneratedOutput }
  | { phase: 'failed'; session: SessionDetail }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'pending':    return { label: 'Ready to Process',       color: '#92400e', bg: '#fef3c7' }
    case 'extracting': return { label: 'Reading Your Files…',    color: '#1e40af', bg: '#dbeafe' }
    case 'generating': return { label: 'Writing Your Briefing…', color: '#6b21a8', bg: '#f3e8ff' }
    case 'completed':  return { label: 'Briefing Ready',         color: '#14532d', bg: '#dcfce7' }
    case 'failed':     return { label: 'Something Went Wrong',   color: '#991b1b', bg: '#fee2e2' }
    default:           return { label: status,                    color: '#374151', bg: '#f3f4f6' }
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Simple markdown renderer: **bold**, - bullets, ## headings, paragraphs
function renderMarkdown(text: string): React.ReactNode {
  const paragraphs = text.split(/\n\n+/).filter(Boolean)
  return paragraphs.map((para, i) => {
    const trimmed = para.trim()
    const lines = trimmed.split('\n').filter(Boolean)

    const listItems = lines.filter(l => /^[-*]\s/.test(l))
    if (listItems.length > 0 && listItems.length === lines.length) {
      return (
        <ul key={i} className="list-disc list-inside space-y-1 my-2 text-gray-700">
          {listItems.map((line, j) => (
            <li key={j} className="leading-relaxed">
              {formatInline(line.replace(/^[-*]\s/, ''))}
            </li>
          ))}
        </ul>
      )
    }

    if (/^##\s/.test(trimmed)) {
      return (
        <h3 key={i} className="font-semibold text-gray-900 mt-3 mb-1 text-sm">
          {formatInline(trimmed.slice(3))}
        </h3>
      )
    }

    return (
      <p key={i} className="text-gray-700 leading-relaxed text-sm">
        {lines.map((line, j) => (
          <span key={j}>
            {formatInline(line)}
            {j < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    )
  })
}

function formatInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part)
      ? <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  section,
  animateIn = false,
}: {
  section: GeneratedSection
  animateIn?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(section.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {/* clipboard unavailable */})
  }

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
      style={{
        borderLeft: '4px solid #f36f21',
        ...(animateIn
          ? { animation: 'slideInUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) both' }
          : {}),
      }}
    >
      <div className="px-6 py-5">
        <div className="flex items-start gap-4">
          <span
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white leading-none"
            style={{ backgroundColor: '#f36f21' }}
          >
            {String(section.section_order).padStart(2, '0')}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold tracking-widest uppercase text-gray-400">
                {section.section_title}
              </p>
              <button
                onClick={handleCopy}
                aria-label={copied ? 'Copied!' : 'Copy section to clipboard'}
                className="flex-shrink-0 ml-2 p-1.5 rounded-md transition-colors hover:bg-gray-100 active:bg-gray-200"
                style={{ color: copied ? '#0f6b37' : '#9ca3af' }}
              >
                {copied ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
            <div className="space-y-2">
              {renderMarkdown(section.content)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
      style={{ borderLeft: '4px solid #e5e7eb' }}
    >
      <div className="px-6 py-5">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-2.5 bg-gray-200 rounded animate-pulse w-1/4" />
            <div className="h-4 bg-gray-100 rounded animate-pulse w-full mt-3" />
            <div className="h-4 bg-gray-100 rounded animate-pulse w-5/6" />
            <div className="h-4 bg-gray-100 rounded animate-pulse w-4/6" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SessionPageClient({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [actionLoading, setActionLoading] = useState<'extract' | 'generate' | null>(null)
  const [newSectionIdx, setNewSectionIdx] = useState<number>(-1)
  const [showSlowGeneration, setShowSlowGeneration] = useState(false)
  const mountedRef = useRef(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const fetchSession = useCallback(async (): Promise<SessionDetail> => {
    const res = await fetch(`/api/sessions/${sessionId}`)
    if (!res.ok) throw new Error('Session not found')
    const json = await res.json()
    if (json.error) throw new Error(json.error.message as string)
    return json.data as SessionDetail
  }, [sessionId])

  const loadOutput = useCallback(async (session: SessionDetail) => {
    if (!mountedRef.current) return
    const res = await fetch(`/api/sessions/${session.id}/output`)
    const json = await res.json()
    if (!mountedRef.current) return
    if (json.data) {
      setState({ phase: 'completed', session, output: json.data as GeneratedOutput })
    } else {
      setState({ phase: 'failed', session })
    }
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      if (!mountedRef.current) { stopPolling(); return }
      try {
        const session = await fetchSession()
        if (!mountedRef.current) return
        if (session.status === 'completed') {
          stopPolling()
          await loadOutput(session)
        } else if (session.status === 'failed') {
          stopPolling()
          setState({ phase: 'failed', session })
        } else if (session.status === 'pending') {
          stopPolling()
          setState({ phase: 'pending', session })
        }
      } catch {
        // keep polling on transient errors
      }
    }, 2500)
  }, [fetchSession, loadOutput, stopPolling])

  useEffect(() => {
    mountedRef.current = true

    const init = async () => {
      try {
        const session = await fetchSession()
        if (!mountedRef.current) return
        if (session.status === 'pending') {
          setState({ phase: 'pending', session })
        } else if (session.status === 'extracting') {
          setState({ phase: 'extracting', session })
          startPolling()
        } else if (session.status === 'generating') {
          setState({ phase: 'generating', session, sections: [] })
          startPolling()
        } else if (session.status === 'completed') {
          await loadOutput(session)
        } else {
          setState({ phase: 'failed', session })
        }
      } catch (e: unknown) {
        if (mountedRef.current) {
          const msg = e instanceof Error ? e.message : 'Unable to load session'
          setState({ phase: 'fetch_error', message: msg })
        }
      }
    }

    init()

    return () => {
      mountedRef.current = false
      stopPolling()
      abortRef.current?.abort()
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
    }
  }, [sessionId, fetchSession, startPolling, loadOutput, stopPolling])

  // ── Action: Extract ──────────────────────────────────────────────────────────

  const handleExtract = async () => {
    if (state.phase !== 'pending') return
    const session = state.session
    setActionLoading('extract')
    setState({ phase: 'extracting', session })
    try {
      const res = await fetch(`/api/sessions/${sessionId}/extract`, { method: 'POST' })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error((json?.error?.message as string | undefined) ?? 'Extraction failed')
      }
      if (mountedRef.current) {
        const updated = await fetchSession()
        setState({ phase: 'pending', session: updated })
      }
    } catch (e: unknown) {
      if (mountedRef.current) {
        const msg = e instanceof Error ? e.message : 'Text extraction failed. Please try again.'
        setState({ phase: 'fetch_error', message: msg })
      }
    } finally {
      if (mountedRef.current) setActionLoading(null)
    }
  }

  // ── Action: Generate (SSE) ───────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (state.phase !== 'pending') return
    let session = state.session
    setActionLoading('generate')
    const sections: GeneratedSection[] = []

    // Auto-extract if no files have been extracted yet
    const hasExtractedFiles = session.uploaded_files.some(
      f => f.extraction_status === 'completed'
    )
    if (!hasExtractedFiles) {
      setState({ phase: 'extracting', session })
      try {
        const extractRes = await fetch(`/api/sessions/${sessionId}/extract`, { method: 'POST' })
        if (!extractRes.ok) {
          const json = await extractRes.json().catch(() => null)
          throw new Error((json?.error?.message as string | undefined) ?? 'Text extraction failed')
        }
        // Re-fetch session to get updated uploaded_files
        session = await fetchSession()
        if (!mountedRef.current) return
      } catch (e: unknown) {
        if (mountedRef.current) {
          const msg = e instanceof Error ? e.message : 'Text extraction failed'
          setState({ phase: 'fetch_error', message: msg })
          setActionLoading(null)
        }
        return
      }
    }

    setState({ phase: 'generating', session, sections: [] })
    setNewSectionIdx(-1)
    setShowSlowGeneration(false)
    setActionLoading(null)

    // Show "taking longer than usual" message after 90s with no completion
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
    slowTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setShowSlowGeneration(true)
    }, 90000)

    try {
      abortRef.current = new AbortController()
      const res = await fetch(`/api/sessions/${sessionId}/generate`, {
        method: 'POST',
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null)
        const msg = (json?.error?.message as string | undefined) ?? 'Generation could not be started. Please try again.'
        throw new Error(msg)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEvent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const payload = JSON.parse(line.slice(6).trim()) as Record<string, unknown>
              if (currentEvent === 'section') {
                sections.push(payload as unknown as GeneratedSection)
                const snapshot = [...sections]
                const newIdx = snapshot.length - 1
                if (mountedRef.current) {
                  setState(prev =>
                    prev.phase === 'generating'
                      ? { ...prev, sections: snapshot }
                      : prev
                  )
                  setNewSectionIdx(newIdx)
                  setTimeout(() => setNewSectionIdx(-1), 600)
                }
              } else if (currentEvent === 'complete') {
                stopPolling()
                if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
                if (mountedRef.current) await loadOutput(session)
                return
              } else if (currentEvent === 'error') {
                const msg = (payload.message as string | undefined) ?? 'Generation encountered an error. Please try again.'
                if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
                if (mountedRef.current) setState({ phase: 'fetch_error', message: msg })
                return
              }
            } catch {
              // malformed SSE data, skip
            }
            currentEvent = ''
          }
        }
      }

      // Stream ended without explicit 'complete' event
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
      if (mountedRef.current) {
        if (sections.length > 0) {
          await loadOutput(session)
        } else {
          setState({ phase: 'failed', session })
        }
      }
    } catch (e: unknown) {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
      if (e instanceof Error && e.name === 'AbortError') return
      if (mountedRef.current) {
        if (sections.length > 0) {
          await loadOutput(session)
        } else {
          setState({ phase: 'failed', session })
        }
      }
    }
  }

  // ── Action: Retry ────────────────────────────────────────────────────────────

  const handleRetry = async () => {
    setState({ phase: 'loading' })
    try {
      const session = await fetchSession()
      if (!mountedRef.current) return
      setState({ phase: 'pending', session })
    } catch (e: unknown) {
      if (mountedRef.current) {
        const msg = e instanceof Error ? e.message : 'Unable to reload session'
        setState({ phase: 'fetch_error', message: msg })
      }
    }
  }

  // ─── Derived values ───────────────────────────────────────────────────────────

  const speakerName =
    state.phase !== 'loading' && state.phase !== 'fetch_error'
      ? state.session.speaker_name
      : null

  const currentStatus =
    state.phase !== 'loading' && state.phase !== 'fetch_error'
      ? state.session.status
      : null

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: '#faf9f6', fontFamily: "'Source Sans 3', Arial, sans-serif" }}
    >
      {/* Brand top-bar */}
      <div className="h-1 w-full" style={{ backgroundColor: '#f36f21' }} />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <nav className="text-xs text-gray-400 mb-1 flex items-center gap-1.5">
            <Link href="/sessions" className="hover:text-gray-600 transition-colors">Sessions</Link>
            {speakerName && (
              <>
                <span>›</span>
                <span className="text-gray-500 truncate max-w-xs">{speakerName}</span>
              </>
            )}
          </nav>
          <div className="flex items-center justify-between gap-4">
            <h1
              className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight truncate"
              style={{ fontFamily: "'Lora', Georgia, serif" }}
            >
              {speakerName ?? 'Loading…'}
            </h1>
            {currentStatus && (() => {
              const { label, color, bg } = statusBadge(currentStatus)
              return (
                <span
                  className="flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full"
                  style={{ color, backgroundColor: bg }}
                >
                  {label}
                </span>
              )
            })()}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Loading ───────────────────────────────────────────────────────── */}
        {state.phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div
              className="w-10 h-10 rounded-full border-4 animate-spin"
              style={{ borderColor: '#f36f21', borderTopColor: 'transparent' }}
            />
            <p className="text-gray-400 text-sm">Loading session…</p>
          </div>
        )}

        {/* ── Fetch Error ───────────────────────────────────────────────────── */}
        {state.phase === 'fetch_error' && (
          <div className="bg-white rounded-2xl border border-red-100 p-8 text-center shadow-sm">
            <div className="text-3xl mb-4">⚠️</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Unable to Load Session</h2>
            <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">{state.message}</p>
            <button
              onClick={handleRetry}
              className="px-6 py-2 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90 active:opacity-75"
              style={{ backgroundColor: '#f36f21' }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* ── State A: Pending ──────────────────────────────────────────────── */}
        {state.phase === 'pending' && (
          <div>
            {/* Session meta */}
            <p className="text-gray-400 text-xs mb-6">
              Created {formatDate(state.session.created_at)}
              {state.session.zip_filename ? ` · ${state.session.zip_filename}` : ''}
            </p>

            {/* Uploaded files summary */}
            {state.session.uploaded_files.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                  Uploaded Files
                </p>
                <div className="divide-y divide-gray-50">
                  {state.session.uploaded_files.map(f => (
                    <div key={f.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-gray-700 truncate max-w-[70%]">{f.filename}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          f.extraction_status === 'completed'
                            ? 'bg-green-50 text-green-700'
                            : f.extraction_status === 'skipped'
                            ? 'bg-yellow-50 text-yellow-700'
                            : f.extraction_status === 'failed'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-gray-50 text-gray-500'
                        }`}
                      >
                        {f.extraction_status === 'completed'
                          ? 'Ready'
                          : f.extraction_status === 'skipped'
                          ? 'Skipped'
                          : f.extraction_status === 'failed'
                          ? 'Failed'
                          : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Extract */}
              <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm flex flex-col">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg mb-4"
                  style={{ backgroundColor: '#f3e8ff', color: '#542785' }}
                >
                  📄
                </div>
                <h3 className="font-semibold text-gray-900 text-sm mb-2">Step 1 — Extract Text</h3>
                <p className="text-xs text-gray-500 flex-1 mb-5 leading-relaxed">
                  Reads the documents in your uploaded ZIP and pulls out the text. Run this before generating your briefing.
                </p>
                <button
                  onClick={handleExtract}
                  disabled={actionLoading !== null}
                  className="w-full py-2.5 px-4 rounded-lg text-sm font-medium border-2 transition-colors disabled:opacity-50"
                  style={{ borderColor: '#542785', color: '#542785' }}
                >
                  {actionLoading === 'extract' ? 'Extracting…' : 'Extract Text'}
                </button>
              </div>

              {/* Generate */}
              <div
                className="bg-white rounded-xl border-2 p-6 shadow-sm flex flex-col"
                style={{ borderColor: '#f36f21' }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg mb-4"
                  style={{ backgroundColor: '#fff7ed', color: '#f36f21' }}
                >
                  ✨
                </div>
                <h3 className="font-semibold text-gray-900 text-sm mb-2">Step 2 — Generate Briefing</h3>
                <p className="text-xs text-gray-500 flex-1 mb-5 leading-relaxed">
                  Creates your complete 10-section speaker briefing document. Takes around 30–60 seconds.
                </p>
                <button
                  onClick={handleGenerate}
                  disabled={actionLoading !== null}
                  className="w-full py-2.5 px-4 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90 active:opacity-75"
                  style={{ backgroundColor: '#f36f21' }}
                >
                  {actionLoading === 'generate' ? 'Starting…' : 'Generate Briefing'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── State: Extracting (in-progress spinner) ───────────────────────── */}
        {state.phase === 'extracting' && (
          <div className="bg-white rounded-2xl border border-blue-100 p-10 text-center shadow-sm">
            <div
              className="w-12 h-12 rounded-full border-4 animate-spin mx-auto mb-5"
              style={{ borderColor: '#542785', borderTopColor: 'transparent' }}
            />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Reading Your Files</h2>
            <p className="text-gray-500 text-sm max-w-xs mx-auto">
              Extracting text from your uploaded documents. This usually takes under a minute.
            </p>
          </div>
        )}

        {/* ── State B: Generating (live SSE) ────────────────────────────────── */}
        {state.phase === 'generating' && (
          <div>
            {/* Progress bar */}
            <div
              className="rounded-xl p-5 mb-5 shadow-sm"
              style={{ backgroundColor: '#542785' }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full bg-white"
                    style={{ animation: 'progressPulse 1.4s ease-in-out infinite' }}
                  />
                  <span className="text-white font-medium text-sm">Writing your briefing…</span>
                </div>
                <span className="text-purple-300 text-xs tabular-nums">
                  {state.sections.length} / 10
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    backgroundColor: '#f36f21',
                    width: `${Math.max(3, (state.sections.length / 10) * 100)}%`,
                  }}
                />
              </div>
              {showSlowGeneration && (
                <p className="text-purple-200 text-xs mt-3 text-center">
                  Taking longer than usual… still working on it.
                </p>
              )}
            </div>

            {/* Live section cards */}
            <div className="space-y-4">
              {state.sections.map((section, idx) => (
                <SectionCard
                  key={section.section_key}
                  section={section}
                  animateIn={idx === newSectionIdx}
                />
              ))}
              {state.sections.length < 10 && <SkeletonCard />}
            </div>
          </div>
        )}

        {/* ── State C: Completed ────────────────────────────────────────────── */}
        {state.phase === 'completed' && (
          <div>
            {/* Completion header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 p-4 bg-white rounded-xl border border-green-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: '#0f6b37' }}
                >
                  ✓
                </div>
                <div>
                  <p
                    className="font-semibold text-gray-900 text-sm"
                    style={{ fontFamily: "'Lora', Georgia, serif" }}
                  >
                    Briefing Complete
                  </p>
                  <p className="text-xs text-gray-400">
                    {state.output.sections.length} sections · Generated {formatDate(state.output.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <a
                  href={`/api/sessions/${sessionId}/export/pdf`}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#0f6b37' }}
                >
                  ⬇ PDF
                </a>
                <a
                  href={`/api/sessions/${sessionId}/export/docx`}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border-2 transition-colors hover:bg-green-50"
                  style={{ borderColor: '#0f6b37', color: '#0f6b37' }}
                >
                  ⬇ Word
                </a>
              </div>
            </div>

            {/* All sections */}
            <div className="space-y-4">
              {[...state.output.sections]
                .sort((a, b) => a.section_order - b.section_order)
                .map(section => (
                  <SectionCard key={section.section_key} section={section} />
                ))}
            </div>
          </div>
        )}

        {/* ── State D: Failed ───────────────────────────────────────────────── */}
        {state.phase === 'failed' && (
          <div className="bg-white rounded-2xl border border-red-100 p-8 shadow-sm">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold flex-shrink-0">
                ✕
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Something Went Wrong</h2>
                <p className="text-gray-500 text-sm leading-relaxed">
                  {state.session.error_message
                    ? state.session.error_message
                    : "We weren't able to complete the briefing. You can try generating again below."}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleRetry}
                className="px-6 py-2.5 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90 active:opacity-75"
                style={{ backgroundColor: '#f36f21' }}
              >
                Try Again
              </button>
              <Link
                href="/sessions"
                className="px-6 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 text-center transition-colors hover:bg-gray-50"
              >
                Back to Sessions
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

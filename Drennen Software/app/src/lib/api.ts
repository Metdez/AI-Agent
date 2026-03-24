/**
 * Shared typed API client for Drennen MGMT 305.
 * All functions read the Supabase session from browser cookies automatically
 * (Next.js App Router handles cookie forwarding for same-origin requests).
 */

import type { ApiResponse, SessionDetail, SessionSummary, SessionStatus } from '@/lib/types'

// ─── Request / Response Types ────────────────────────────────────────────────

export type CreateSessionRequest = {
  speaker_name: string
  zip_filename: string
  zip_size_bytes: number
}

export type CreateSessionResponse = ApiResponse<{
  session_id: string
  upload_url: string
  upload_path: string
  expires_at: string
}>

export type ConfirmUploadRequest = {
  actual_size_bytes?: number
}

export type ConfirmUploadResponse = ApiResponse<{
  session_id: string
  status: 'pending'
  message: string
}>

export type GetSessionResponse = ApiResponse<SessionDetail>

export type ListSessionsResponse = ApiResponse<{
  sessions: SessionSummary[]
  total: number
  page: number
  limit: number
}>

// ─── Client Functions ─────────────────────────────────────────────────────────

/** Create a new session and obtain a signed Supabase Storage upload URL. */
export async function createSession(
  req: CreateSessionRequest
): Promise<CreateSessionResponse> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  return res.json() as Promise<CreateSessionResponse>
}

/** Confirm that the ZIP was uploaded successfully to the signed URL. */
export async function confirmUpload(
  sessionId: string,
  req: ConfirmUploadRequest = {}
): Promise<ConfirmUploadResponse> {
  const res = await fetch(`/api/sessions/${sessionId}/confirm-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  return res.json() as Promise<ConfirmUploadResponse>
}

/** Fetch a single session by ID. */
export async function getSession(sessionId: string): Promise<GetSessionResponse> {
  const res = await fetch(`/api/sessions/${sessionId}`)
  return res.json() as Promise<GetSessionResponse>
}

/** List sessions with optional pagination and status filter. */
export async function listSessions(opts: {
  page?: number
  limit?: number
  status?: SessionStatus
} = {}): Promise<ListSessionsResponse> {
  const params = new URLSearchParams()
  if (opts.page)   params.set('page',   String(opts.page))
  if (opts.limit)  params.set('limit',  String(opts.limit))
  if (opts.status) params.set('status', opts.status)
  const qs = params.toString()
  const res = await fetch(`/api/sessions${qs ? `?${qs}` : ''}`)
  return res.json() as Promise<ListSessionsResponse>
}

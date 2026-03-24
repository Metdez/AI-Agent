export type ApiSuccess<T> = { data: T; error: null }
export type ApiError = { data: null; error: { code: string; message: string } }
export type ApiResponse<T> = ApiSuccess<T> | ApiError

export type SessionStatus = 'pending' | 'extracting' | 'generating' | 'completed' | 'failed'

export type SectionKey =
  | 'executive_summary' | 'speaker_biography' | 'key_accomplishments'
  | 'core_messages' | 'areas_of_expertise' | 'speaking_style'
  | 'audience_considerations' | 'qa_preparation' | 'logistical_notes' | 'online_presence'

export type UploadedFileSummary = {
  id: string
  filename: string
  file_type: string
  size_bytes: number | null
  extraction_status: 'pending' | 'completed' | 'skipped' | 'failed'
  skip_reason: string | null
  char_count: number | null
}

export type SessionSummary = {
  id: string
  speaker_name: string
  status: SessionStatus
  zip_filename: string | null
  created_at: string
  completed_at: string | null
}

export type SessionDetail = SessionSummary & {
  zip_size_bytes: number | null
  error_message: string | null
  uploaded_files: UploadedFileSummary[]
}

export type GeneratedSection = {
  section_order: number
  section_key: SectionKey
  section_title: string
  content: string
}

export type GeneratedOutput = {
  session_id: string
  speaker_name: string
  sections: GeneratedSection[]
  created_at: string
}

export function jsonSuccess<T>(data: T, status = 200): Response {
  return Response.json({ data, error: null }, { status })
}

export function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ data: null, error: { code, message } }, { status })
}

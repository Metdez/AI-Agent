'use client'

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import TopNav from '@/app/TopNav'
import { createSession, confirmUpload } from '@/lib/api'

const MAX_BYTES = 26214400 // 25 MB

type UploadStep =
  | { kind: 'idle' }
  | { kind: 'creating' }
  | { kind: 'uploading'; progress: number }
  | { kind: 'confirming' }
  | { kind: 'error'; message: string }

function StepIndicator({ step }: { step: UploadStep }) {
  const steps = [
    { id: 'creating',   label: 'Creating session' },
    { id: 'uploading',  label: 'Uploading file'   },
    { id: 'confirming', label: 'Confirming'        },
  ]

  const activeIdx = step.kind === 'creating'   ? 0
                  : step.kind === 'uploading'   ? 1
                  : step.kind === 'confirming'  ? 2
                  : -1

  if (activeIdx === -1) return null

  return (
    <div className="flex items-center gap-3 mt-6 justify-center">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{
              backgroundColor: i < activeIdx ? '#0f6b37' : i === activeIdx ? '#f36f21' : '#e5e7eb',
              color: i <= activeIdx ? '#fff' : '#9ca3af',
            }}
          >
            {i < activeIdx ? '✓' : i + 1}
          </div>
          <span
            className="text-xs font-medium hidden sm:block"
            style={{ color: i === activeIdx ? '#f36f21' : i < activeIdx ? '#0f6b37' : '#9ca3af' }}
          >
            {s.label}
            {s.id === 'uploading' && step.kind === 'uploading' && ` (${step.progress}%)`}
          </span>
          {i < steps.length - 1 && <div className="w-6 h-px" style={{ backgroundColor: '#e5e7eb' }} />}
        </div>
      ))}
    </div>
  )
}

export default function UploadPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [speakerName, setSpeakerName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [step, setStep] = useState<UploadStep>({ kind: 'idle' })

  const validateFile = useCallback((f: File): string | null => {
    if (!f.name.toLowerCase().endsWith('.zip')) {
      return 'Only .zip files are accepted.'
    }
    if (f.size > MAX_BYTES) {
      return `File is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Maximum is 25 MB.`
    }
    return null
  }, [])

  const handleFileChange = useCallback((f: File | null) => {
    if (!f) return
    const err = validateFile(f)
    setFileError(err)
    setFile(err ? null : f)
  }, [validateFile])

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFileChange(e.target.files?.[0] ?? null)
  }

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = () => setIsDragging(false)

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileChange(e.dataTransfer.files?.[0] ?? null)
  }

  const isSubmitting = step.kind !== 'idle' && step.kind !== 'error'
  const canSubmit = speakerName.trim().length > 0 && speakerName.trim().length <= 200 && !!file && !isSubmitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !canSubmit) return

    setStep({ kind: 'creating' })

    // Step 1: create session + get signed URL
    let sessionId: string
    let uploadUrl: string
    try {
      const res = await createSession({
        speaker_name: speakerName.trim(),
        zip_filename: file.name,
        zip_size_bytes: file.size,
      })
      if (res.error) {
        setStep({ kind: 'error', message: res.error.message })
        return
      }
      sessionId = res.data.session_id
      uploadUrl = res.data.upload_url
    } catch {
      setStep({ kind: 'error', message: 'Unable to connect. Please try again.' })
      return
    }

    // Step 2: PUT file directly to Supabase Storage signed URL
    setStep({ kind: 'uploading', progress: 0 })
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100)
            setStep({ kind: 'uploading', progress: pct })
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Upload failed (HTTP ${xhr.status})`))
        }
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', 'application/zip')
        xhr.send(file)
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.'
      setStep({ kind: 'error', message: msg })
      return
    }

    // Step 3: confirm upload
    setStep({ kind: 'confirming' })
    try {
      const res = await confirmUpload(sessionId, { actual_size_bytes: file.size })
      if (res.error) {
        setStep({ kind: 'error', message: res.error.message })
        return
      }
    } catch {
      setStep({ kind: 'error', message: 'Upload succeeded but confirmation failed. Please contact support.' })
      return
    }

    // Navigate to session page
    router.push(`/sessions/${sessionId}`)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#faf9f6', fontFamily: "'Source Sans 3', Arial, sans-serif" }}>
      <div className="h-1 w-full" style={{ backgroundColor: '#f36f21' }} />
      <TopNav userEmail={null} />

      <main className="flex-1 max-w-xl mx-auto w-full px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            New Speaker Briefing
          </h1>
          <p className="text-sm text-gray-500 mt-1">Upload a ZIP of the speaker&apos;s documents to generate a briefing.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          {/* Speaker Name */}
          <div>
            <label htmlFor="speakerName" className="block text-sm font-semibold text-gray-700 mb-1">
              Speaker Name <span className="text-red-400">*</span>
            </label>
            <input
              id="speakerName"
              type="text"
              required
              maxLength={200}
              value={speakerName}
              onChange={e => setSpeakerName(e.target.value)}
              disabled={isSubmitting}
              placeholder="e.g. Dr. Jane Smith"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
              style={{ focusRingColor: '#f36f21' } as React.CSSProperties}
            />
            {speakerName.length > 190 && (
              <p className="text-xs text-gray-400 mt-1">{speakerName.length}/200 characters</p>
            )}
          </div>

          {/* Drag-and-drop zone */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Speaker Documents <span className="text-red-400">*</span>
            </label>
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload ZIP file"
              onClick={() => !isSubmitting && fileInputRef.current?.click()}
              onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !isSubmitting) fileInputRef.current?.click() }}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className="relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
              style={{
                borderColor: isDragging ? '#f36f21' : file ? '#0f6b37' : '#d1d5db',
                backgroundColor: isDragging ? '#fff7ed' : file ? '#f0fdf4' : '#fafafa',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={onInputChange}
                disabled={isSubmitting}
              />

              {file ? (
                <div className="space-y-1">
                  <div className="text-2xl">📦</div>
                  <p className="text-sm font-semibold text-gray-800">{file.name}</p>
                  <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  {!isSubmitting && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setFile(null); setFileError(null) }}
                      className="text-xs text-gray-400 hover:text-red-500 underline mt-1"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-3xl">📁</div>
                  <p className="text-sm font-medium text-gray-600">
                    Drag &amp; drop your ZIP here, or <span style={{ color: '#f36f21' }}>browse</span>
                  </p>
                  <p className="text-xs text-gray-400">ZIP files only · max 25 MB</p>
                </div>
              )}
            </div>

            {fileError && (
              <p className="text-sm text-red-600 mt-2">{fileError}</p>
            )}
          </div>

          {/* Step indicator */}
          <StepIndicator step={step} />

          {/* Error banner */}
          {step.kind === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {step.message}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-40 transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#f36f21' }}
          >
            {isSubmitting ? 'Uploading…' : 'Generate Briefing'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          <a href="/dashboard" style={{ color: '#542785' }}>← Back to Dashboard</a>
        </p>
      </main>
    </div>
  )
}

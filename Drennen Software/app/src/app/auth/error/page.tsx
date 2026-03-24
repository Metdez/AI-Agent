'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function AuthErrorPage() {
  const searchParams = useSearchParams()
  const errorCode = searchParams.get('error_code') ?? 'unknown'
  const errorDescription = searchParams.get('error_description') ?? 'An unexpected error occurred during sign-in.'

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#faf9f6' }}>
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-8" style={{ color: '#542785' }}>Drennen MGMT 305</h1>
        <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#fef2f2' }}>
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Sign-in failed</h2>
          <p className="text-sm text-gray-600 mb-1">{decodeURIComponent(errorDescription)}</p>
          {errorCode !== 'unknown' && (
            <p className="text-xs text-gray-400 mb-6">Error code: {errorCode}</p>
          )}
          <Link
            href="/login"
            className="inline-block w-full py-2.5 rounded-lg text-white text-sm font-semibold"
            style={{ backgroundColor: '#542785' }}
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}

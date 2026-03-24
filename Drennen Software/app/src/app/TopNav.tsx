'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function TopNav({ userEmail }: { userEmail: string | null }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogout = async () => {
    setLoading(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      router.push('/login')
      router.refresh()
    }
  }

  return (
    <nav style={{ backgroundColor: '#542785' }} className="w-full flex-shrink-0">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <a
          href="/dashboard"
          className="text-white font-semibold text-base hover:opacity-80 transition-opacity"
          style={{ fontFamily: "'Lora', Georgia, serif" }}
        >
          Drennen MGMT 305
        </a>
        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="text-purple-200 text-sm hidden sm:block truncate max-w-[200px]">
              {userEmail}
            </span>
          )}
          <button
            onClick={handleLogout}
            disabled={loading}
            className="text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 active:opacity-60 disabled:opacity-40"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            {loading ? 'Signing out…' : 'Sign Out'}
          </button>
        </div>
      </div>
    </nav>
  )
}

'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message ?? 'Invalid email or password.')
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Unable to connect.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#faf9f6' }}>
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-8" style={{ color: '#542785' }}>Drennen MGMT 305</h1>
        <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
          <h2 className="text-lg font-semibold mb-6">Sign In</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: '#f36f21' }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-gray-500 mt-4">
          No account? <a href="/signup" style={{ color: '#542785' }}>Create one</a>
        </p>
      </div>
    </div>
  )
}

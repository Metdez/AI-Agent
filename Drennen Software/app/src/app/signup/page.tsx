'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function SignupPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [institution, setInstitution] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName, institution: institution || undefined }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.code === 'EMAIL_IN_USE'
          ? 'An account with that email already exists.'
          : json.error?.message ?? 'Something went wrong.')
        return
      }
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!loginRes.ok) { router.push('/login'); return }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Unable to connect.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ backgroundColor: '#faf9f6' }}>
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-8" style={{ color: '#542785' }}>Drennen MGMT 305</h1>
        <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
          <h2 className="text-lg font-semibold mb-6">Create Your Account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
              <input id="fullName" type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none" placeholder="Dr. Jane Smith" />
            </div>
            <div>
              <label htmlFor="institution" className="block text-sm font-medium text-gray-700 mb-1">
                Institution <span className="text-gray-400">(optional)</span>
              </label>
              <input id="institution" type="text" value={institution} onChange={e => setInstitution(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none" placeholder="Santa Clara University" />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password <span className="text-gray-400">(min. 8 chars)</span>
              </label>
              <input id="password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: '#f36f21' }}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-gray-500 mt-4">
          Have an account? <a href="/login" style={{ color: '#542785' }}>Sign in</a>
        </p>
      </div>
    </div>
  )
}

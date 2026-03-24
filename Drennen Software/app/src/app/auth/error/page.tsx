export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#faf9f6' }}>
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-8" style={{ color: '#542785' }}>Drennen MGMT 305</h1>
        <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold mb-2">Sign-in failed</h2>
          <p className="text-sm text-gray-500 mb-6">
            Something went wrong during Google sign-in. Please try again.
          </p>
          <a
            href="/login"
            className="inline-block w-full py-2.5 rounded-lg text-white text-sm font-semibold text-center"
            style={{ backgroundColor: '#f36f21' }}
          >
            Back to Sign In
          </a>
        </div>
      </div>
    </div>
  )
}

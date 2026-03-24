/**
 * @jest-environment jsdom
 *
 * Component tests for the LoginPage:
 * - Render: "Sign in with Google" button is present in the DOM
 * - Click: signInWithOAuth({ provider: 'google' }) is called on button click
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

const mockPush = jest.fn()
const mockRefresh = jest.fn()
const mockGet = jest.fn().mockReturnValue(null)

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  useSearchParams: () => ({ get: mockGet }),
}))

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/client
// ---------------------------------------------------------------------------

const mockSignInWithOAuth = jest.fn().mockResolvedValue({ error: null })

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}))

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

import LoginPage from '../app/login/page'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoginPage — Google sign-in button', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGet.mockReturnValue(null)
  })

  it('renders the "Sign in with Google" button', () => {
    render(<LoginPage />)
    expect(
      screen.getByRole('button', { name: /sign in with google/i })
    ).toBeInTheDocument()
  })

  it('calls signInWithOAuth with provider "google" on button click', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    const googleBtn = screen.getByRole('button', { name: /sign in with google/i })
    await user.click(googleBtn)

    expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1)
    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    )
  })

  it('does not call signInWithOAuth when already loading (double-click guard)', async () => {
    // Make the first call never resolve so oauthLoading stays true
    mockSignInWithOAuth.mockImplementationOnce(() => new Promise(() => {}))

    const user = userEvent.setup()
    render(<LoginPage />)

    const googleBtn = screen.getByRole('button', { name: /sign in with google/i })
    await user.click(googleBtn)
    await user.click(googleBtn)

    expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1)
  })
})

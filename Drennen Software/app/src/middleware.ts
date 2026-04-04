import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_AUTH_ROUTES = [
  '/api/auth/signup',
  '/api/auth/login',
  '/auth/callback',
  '/auth/error',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Create a response to pass through
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session (important for token rotation)
  const { data: { user } } = await supabase.auth.getUser()

  // Allow public auth routes without authentication
  if (PUBLIC_AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    return response
  }

  // Protect API routes (except public auth routes)
  if (pathname.startsWith('/api/')) {
    if (!user) {
      return Response.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      )
    }
    return response
  }

  // Redirect unauthenticated UI requests to /login
  if (!user && !pathname.startsWith('/login') && !pathname.startsWith('/signup')) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from login/signup
  if (user && (pathname.startsWith('/login') || pathname.startsWith('/signup'))) {
    const homeUrl = new URL('/dashboard', request.url)
    return NextResponse.redirect(homeUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

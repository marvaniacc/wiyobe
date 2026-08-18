import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SUPPORTED_LOCALES = ['en', 'tr', 'fa', 'ar', 'ru'] as const
const DEFAULT_LOCALE = 'en'

// Routes that should NOT be intercepted by the i18n middleware.
// These are served directly without a locale prefix.
const EXCLUDED_PATHS = [
  '/api',
  '/_next',
  '/dashboard',
  '/login',
  '/robots.txt',
  '/sitemap.xml',
  '/favicon.ico',
  '/uploads',
]

function isExcluded(pathname: string): boolean {
  return EXCLUDED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function getLocaleFromCookie(req: NextRequest): string | null {
  const locale = req.cookies.get('NEXT_LOCALE')?.value
  if (locale && SUPPORTED_LOCALES.includes(locale as any)) return locale
  return null
}

function getLocaleFromHeader(req: NextRequest): string {
  const acceptLang = req.headers.get('accept-language')
  if (!acceptLang) return DEFAULT_LOCALE

  // Parse Accept-Language header: "en-US,en;q=0.9,fa;q=0.8" → ["en-US", "en", "fa"]
  const languages = acceptLang
    .split(',')
    .map((l) => l.split(';')[0].trim().split('-')[0].toLowerCase())
    .filter(Boolean)

  for (const lang of languages) {
    if (SUPPORTED_LOCALES.includes(lang as any)) return lang
  }
  return DEFAULT_LOCALE
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip excluded paths (API, _next, dashboard, static files, etc.)
  if (isExcluded(pathname)) {
    return NextResponse.next()
  }

  // Don't intercept the root path — let the root page.tsx redirect to /dashboard
  if (pathname === '/') {
    return NextResponse.next()
  }

  // Check if the first path segment is already a supported locale
  const segments = pathname.split('/').filter(Boolean)
  const firstSegment = segments[0]

  if (firstSegment && SUPPORTED_LOCALES.includes(firstSegment as any)) {
    // Already has a locale prefix — forward the locale to layouts via a
    // request header so the root layout can set <html lang> correctly.
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-locale', firstSegment)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // No locale prefix — detect and redirect
  const locale = getLocaleFromCookie(req) || getLocaleFromHeader(req)

  const url = req.nextUrl.clone()
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`
  return NextResponse.redirect(url, 307)
}

export const config = {
  // Match all paths except excluded ones
  matcher: [
    '/((?!api|_next/static|_next/image|dashboard|login|robots\\.txt|sitemap\\.xml|favicon\\.ico|uploads|$).*)',
  ],
}

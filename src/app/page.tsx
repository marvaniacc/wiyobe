import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Root page — redirects to the default locale landing page.
 *
 * In production, `/` redirects to `/en` (the public SSR landing page).
 * The SPA dashboard lives at `/dashboard` and is unaffected.
 *
 * Locale detection from Accept-Language header could be added here,
 * but for simplicity we default to 'en'. The middleware handles
 * locale-specific routing for /{locale}/... paths.
 */
export default function RootPage() {
  redirect('/en')
}

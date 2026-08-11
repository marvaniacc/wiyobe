import { redirect } from 'next/navigation'

/**
 * Root page — redirects to the SPA dashboard.
 *
 * The public SSR pages now live under /{locale}/... (see src/app/[locale]/).
 * The interactive SPA shell (auth, dashboard, landing) lives at /dashboard.
 *
 * Hitting the bare `/` path redirects to /dashboard so existing bookmarks
 * and links keep working.
 */
export default function RootPage() {
  redirect('/dashboard')
}

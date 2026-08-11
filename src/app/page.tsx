import { DefaultLanding } from '@/components/landing/default-landing'

export const dynamic = 'force-dynamic'

/**
 * Root page — renders the SPA directly (no redirect).
 *
 * The IDE Preview panel loads `/` in an iframe. HTTP redirects (307) break
 * iframe rendering in some environments, so we render the DefaultLanding
 * client component directly here instead of redirecting to /dashboard.
 *
 * The public SSR pages live under /{locale}/... (see src/app/[locale]/).
 */
export default function RootPage() {
  return <DefaultLanding />
}

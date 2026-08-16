import { DefaultLanding } from '@/components/landing/default-landing'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

// Dashboard should NOT be indexed by search engines
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/**
 * /dashboard — the Zustand SPA dashboard (auth, landing, dashboard shell).
 *
 * This route is EXCLUDED from the i18n middleware — it's the application
 * panel, not a public marketing page. It ALWAYS renders the DefaultLanding
 * client component which handles session bootstrapping, auth, role
 * selection, and the dashboard.
 *
 * The dynamic CustomPage "home" override lives ONLY at /[locale]/page.tsx
 * (the public SSR landing). The dashboard must never render CustomPage HTML.
 */
export default function DashboardPage() {
  return <DefaultLanding />
}

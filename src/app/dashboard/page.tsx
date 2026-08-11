import { db } from '@/lib/db'
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
 * panel, not a public marketing page. It serves the DefaultLanding client
 * component which handles session bootstrapping, auth, and the dashboard.
 *
 * If a CustomPage with slug "home" is published, it renders that instead
 * (dynamic homepage override).
 */
export default async function DashboardPage() {
  const homePage = await db.customPage.findUnique({
    where: { slug: 'home', deletedAt: null },
    select: { htmlContent: true, isPublished: true },
  })

  if (homePage?.isPublished && homePage.htmlContent) {
    return (
      <div dangerouslySetInnerHTML={{ __html: homePage.htmlContent }} />
    )
  }

  // Default — client-side SPA shell (auth, dashboard, landing)
  return <DefaultLanding />
}

import { db } from '@/lib/db'
import { DefaultLanding } from '@/components/landing/default-landing'

export const dynamic = 'force-dynamic'

/**
 * Root page — Server Component.
 *
 * Dynamic homepage override:
 *  - If a CustomPage with slug "home" exists and is published, render its
 *    htmlContent via dangerouslySetInnerHTML (admin-trusted, no sanitization).
 *  - Otherwise, render the default client-side SPA landing (Zustand shell,
 *    auth, dashboard) via the DefaultLanding client component.
 *
 * The DB query runs on the server so the homepage can be fully SSR'd for
 * SEO when a custom home page is configured.
 */
export default async function Home() {
  const homePage = await db.customPage.findUnique({
    where: { slug: 'home' },
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

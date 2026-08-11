import { db } from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TriageBot } from '@/components/shared/triage-bot'

export const dynamic = 'force-dynamic'

const SUPPORTED_LOCALES = ['en', 'tr', 'fa', 'ar']

/**
 * /{locale} — locale-prefixed landing page.
 *
 * If a CustomPage with slug "home" exists and is published, render its
 * htmlContent (admin-trusted raw HTML/CSS). Otherwise, render a simple
 * landing page with a link to the dashboard.
 */
export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!SUPPORTED_LOCALES.includes(locale)) notFound()

  // Check for custom home page
  const homePage = await db.customPage.findUnique({
    where: { slug: 'home', deletedAt: null },
    select: { htmlContent: true, isPublished: true },
  })

  if (homePage?.isPublished && homePage.htmlContent) {
    return (
      <div dangerouslySetInnerHTML={{ __html: homePage.htmlContent }} />
    )
  }

  // Default landing — link to dashboard + floating AI symptom checker
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-[16px] bg-primary text-primary-foreground">
          <span className="material-symbols-outlined" style={{ fontSize: 36 }} aria-hidden>
            monitor_heart
          </span>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Wishubest</h1>
          <p className="text-muted-foreground">
            Global Medical Tourism Marketplace — Compare and book verified doctors,
            hospitals, accommodations, and translators worldwide.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Go to Dashboard
        </Link>
      </div>

      {/* Floating AI Symptom Checker — FAB in bottom corner */}
      <TriageBot />
    </div>
  )
}

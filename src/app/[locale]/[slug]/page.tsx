import { db } from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

type CustomPage = {
  id: string
  title: string
  slug: string
  htmlContent: string
  seoTitle: string | null
  seoDescription: string | null
  focusKeyword: string | null
  canonicalUrl: string | null
  noIndex: boolean
  isPublished: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Fetch a single published custom page by slug for public rendering.
 * Unpublished pages and non-existent slugs trigger a 404 via notFound().
 */
async function getPage(slug: string): Promise<CustomPage | null> {
  const page = await db.customPage.findUnique({ where: { slug } })
  // Only published, non-soft-deleted pages are publicly accessible.
  if (!page || !page.isPublished || page.deletedAt) return null
  return page
}

/**
 * Generate dynamic SEO metadata from the custom page's seoTitle and
 * seoDescription fields. Falls back to the page title if seoTitle is null.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  const page = await getPage(slug)
  if (!page) {
    return { title: 'Page not found — Wishubest' }
  }

  const metaTitle = page.seoTitle || page.title
  const metaDescription = page.seoDescription || page.title
  const url = `/${locale}/${page.slug}`

  return {
    title: metaTitle,
    description: metaDescription,
    alternates: { canonical: page.canonicalUrl || url },
    robots: page.noIndex ? { index: false, follow: false } : undefined,
    keywords: page.focusKeyword ? [page.focusKeyword] : undefined,
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      type: 'website',
      url,
    },
  }
}

/**
 * Public SSR route for custom landing pages.
 *
 * Next.js automatically prioritizes static folders (/blog, /api, /_next)
 * over this dynamic [slug] route, so there is no conflict with the blog
 * or system routes.
 *
 * The htmlContent is rendered via dangerouslySetInnerHTML WITHOUT
 * sanitization — the admin is a trusted user who needs full HTML/CSS
 * capability. The admin API is strictly protected (ADMIN role only).
 */
export default async function CustomPageRoute({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  const page = await getPage(slug)
  if (!page) notFound()

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal header — brand + back to app */}
      <header className="border-b border-divider bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            <span>←</span>
            <span>Wishubest</span>
          </Link>
          <Link
            href={`/${locale}/blog`}
            className="rounded-full border border-divider px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            Blog
          </Link>
        </div>
      </header>

      {/* Custom HTML content — rendered as-is (admin-trusted) */}
      <main dangerouslySetInnerHTML={{ __html: page.htmlContent }} />

      {/* Footer */}
      <footer className="border-t border-divider bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Wishubest — Global Medical Tourism Marketplace
          </p>
        </div>
      </footer>
    </div>
  )
}

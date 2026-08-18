import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { BlockNoteSSRRenderer } from '@/components/editor/blocknote-ssr-renderer'

export const dynamic = 'force-dynamic'

type CustomPage = {
  id: string
  title: string
  slug: string
  htmlContent: string
  content: unknown
  language: string | null
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
 * Fetch a single published custom page by slug + locale for public rendering.
 * The compound unique [slug, language] allows the same slug to exist for
 * different locales. Unpublished pages and non-existent slugs trigger 404.
 */
async function getPage(slug: string, locale: string): Promise<CustomPage | null> {
  const page = await db.customPage.findFirst({
    where: { slug, language: locale, isPublished: true, deletedAt: null },
  })
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
  const page = await getPage(slug, locale)
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
  const page = await getPage(slug, locale)
  if (!page) notFound()

  // NOTE: The [locale]/layout.tsx already wraps this page with <PublicHeader>
  // + <main> + <PublicFooter>. Do NOT render our own header/footer here —
  // that would cause double headers/footers.
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <BlockNoteSSRRenderer
        content={page.content}
        htmlContent={page.htmlContent}
        locale={page.language || locale}
      />
    </div>
  )
}

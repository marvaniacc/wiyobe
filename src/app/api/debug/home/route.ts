import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/debug/home
 *
 * Debug endpoint — returns all CustomPages with slug starting with "home"
 * so the admin can verify which page the /en landing page will render.
 *
 * Shows: slug, isPublished, deletedAt, hasContent, contentLength,
 * hasHtmlContent, htmlContentLength.
 *
 * Admin only.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const pages = await db.customPage.findMany({
      where: { slug: { startsWith: 'home' } },
      select: {
        id: true,
        title: true,
        slug: true,
        isPublished: true,
        deletedAt: true,
        content: true,
        htmlContent: true,
        language: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    const result = pages.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      isPublished: p.isPublished,
      deletedAt: p.deletedAt,
      hasContent: p.content !== null && p.content !== undefined,
      contentPreview: p.content ? JSON.stringify(p.content).slice(0, 200) : null,
      htmlContentLength: p.htmlContent?.length || 0,
      language: p.language,
      updatedAt: p.updatedAt,
    }))

    return json({
      totalFound: pages.length,
      landingPageLooksFor: 'slug = "home" AND deletedAt = null AND isPublished = true',
      pages: result,
    })
  } catch (e: any) {
    return json({ error: e.message, stack: e.stack }, 500)
  }
}

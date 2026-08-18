import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Ensure slug + language combination is unique. Same logic as the POST
 * route's ensureUniqueSlug — allows same slug for different languages.
 */
async function ensureUniqueSlug(baseSlug: string, language: string, excludeId: string): Promise<string> {
  let slug = baseSlug
  let n = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db.customPage.findFirst({
      where: { slug, language },
      select: { id: true },
    })
    if (!existing || existing.id === excludeId) return slug
    n++
    slug = `${baseSlug}-${n}`
  }
}

/**
 * GET /api/admin/pages/[id]
 *
 * Admin only. Returns a single custom page by id.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const { id } = await params
    const page = await db.customPage.findUnique({ where: { id, deletedAt: null } })
    if (!page) return error(404, 'Page not found')
    return json({ page })
  } catch (e) { return handleError(e) }
}

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().max(200).optional(),
  content: z.any().nullable().optional(),
  htmlContent: z.string().optional(),
  language: z.string().max(10).optional(),
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(500).nullable().optional(),
  focusKeyword: z.string().max(100).nullable().optional(),
  canonicalUrl: z.string().url().nullable().optional(),
  noIndex: z.boolean().optional(),
  isPublished: z.boolean().optional(),
})

/**
 * PATCH /api/admin/pages/[id]
 *
 * Admin only. Updates a custom page.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const { id } = await params
    const body = await parseBody(req, patchSchema)

    const existing = await db.customPage.findUnique({ where: { id } })
    if (!existing) return error(404, 'Page not found')

    let finalSlug: string | undefined
    if (body.slug !== undefined) {
      const newSlug = slugify(body.slug)
      if (!newSlug) return error(400, 'Invalid slug')
      finalSlug = newSlug === existing.slug ? existing.slug : await ensureUniqueSlug(newSlug, body.language || existing.language || 'en', id)
    }

    const updated = await db.customPage.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(finalSlug !== undefined ? { slug: finalSlug } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.language !== undefined ? { language: body.language } : {}),
        ...(body.htmlContent !== undefined ? { htmlContent: body.htmlContent } : {}),
        ...(body.seoTitle !== undefined ? { seoTitle: body.seoTitle } : {}),
        ...(body.seoDescription !== undefined ? { seoDescription: body.seoDescription } : {}),
        ...(body.focusKeyword !== undefined ? { focusKeyword: body.focusKeyword } : {}),
        ...(body.canonicalUrl !== undefined ? { canonicalUrl: body.canonicalUrl } : {}),
        ...(body.noIndex !== undefined ? { noIndex: body.noIndex } : {}),
        ...(body.isPublished !== undefined ? { isPublished: body.isPublished } : {}),
      },
    })
    return json({ page: updated })
  } catch (e) { return handleError(e) }
}

/**
 * DELETE /api/admin/pages/[id]
 *
 * Admin only. Soft-deletes a custom page by setting `deletedAt` to the
 * current time. The page remains in the DB (recoverable from the recycle
 * bin) but is hidden from all default listings.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const { id } = await params
    const existing = await db.customPage.findUnique({ where: { id, deletedAt: null } })
    if (!existing) return error(404, 'Page not found')

    await db.customPage.update({ where: { id }, data: { deletedAt: new Date() } })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}

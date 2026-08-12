import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { json, error, handleError, parseBody } from '@/lib/api'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/** Convert a title into a URL-friendly kebab-case slug. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function ensureUniqueSlug(baseSlug: string, excludeId: string): Promise<string> {
  let slug = baseSlug
  let n = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db.blogPost.findUnique({ where: { slug }, select: { id: true } })
    if (!existing || existing.id === excludeId) return slug
    n++
    slug = `${baseSlug}-${n}`
  }
}

/**
 * GET /api/admin/blog/[id]
 *
 * Admin only. Returns a single blog post (including DRAFTs) by id, with the
 * full TipTap JSON content for editing.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const { id } = await params
    const post = await db.blogPost.findUnique({
      where: { id, deletedAt: null },
      include: { author: { select: { id: true, name: true, email: true } } },
    })
    if (!post) return error(404, 'Post not found')
    return json({ post })
  } catch (e) { return handleError(e) }
}

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().max(200).optional(),
  excerpt: z.string().max(500).optional(),
  content: z.any().optional(),
  coverImage: z.string().url().nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  // SEO fields
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(500).nullable().optional(),
  focusKeyword: z.string().max(100).nullable().optional(),
  canonicalUrl: z.string().url().nullable().optional(),
  noIndex: z.boolean().optional(),
})

/**
 * PATCH /api/admin/blog/[id]
 *
 * Admin only. Updates a blog post. If the slug is changed it is re-validated
 * for uniqueness (de-duplicated with a numeric suffix). Only the author or
 * any admin can edit.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const { id } = await params
    const body = await parseBody(req, patchSchema)

    const existing = await db.blogPost.findUnique({ where: { id } })
    if (!existing) return error(404, 'Post not found')

    // Handle slug change: re-slugify + de-duplicate if the slug actually changed.
    let finalSlug: string | undefined
    if (body.slug !== undefined) {
      const newSlug = slugify(body.slug)
      if (!newSlug) return error(400, 'Invalid slug')
      finalSlug = newSlug === existing.slug ? existing.slug : await ensureUniqueSlug(newSlug, id)
    }

    const updated = await db.blogPost.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(finalSlug !== undefined ? { slug: finalSlug } : {}),
        ...(body.excerpt !== undefined ? { excerpt: body.excerpt } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.coverImage !== undefined ? { coverImage: body.coverImage } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.seoTitle !== undefined ? { seoTitle: body.seoTitle } : {}),
        ...(body.seoDescription !== undefined ? { seoDescription: body.seoDescription } : {}),
        ...(body.focusKeyword !== undefined ? { focusKeyword: body.focusKeyword } : {}),
        ...(body.canonicalUrl !== undefined ? { canonicalUrl: body.canonicalUrl } : {}),
        ...(body.noIndex !== undefined ? { noIndex: body.noIndex } : {}),
      },
      include: { author: { select: { id: true, name: true, email: true } } },
    })
    return json({ post: updated })
  } catch (e) { return handleError(e) }
}

/**
 * DELETE /api/admin/blog/[id]
 *
 * Admin only. Soft-deletes a blog post by setting `deletedAt` to the current
 * time. The post remains in the DB (recoverable from the recycle bin) but is
 * hidden from all default listings.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const { id } = await params
    const existing = await db.blogPost.findUnique({ where: { id, deletedAt: null } })
    if (!existing) return error(404, 'Post not found')

    await db.blogPost.update({ where: { id }, data: { deletedAt: new Date() } })
    return json({ ok: true })
  } catch (e) { return handleError(e) }
}

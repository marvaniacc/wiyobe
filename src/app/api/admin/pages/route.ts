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

/**
 * Ensure slug + language combination is unique. If a page with the same
 * slug already exists for the SAME language, append a numeric suffix.
 * Allows the same slug for DIFFERENT languages (e.g. "home" in en + fa).
 */
async function ensureUniqueSlug(baseSlug: string, language: string, excludeId?: string): Promise<string> {
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
 * GET /api/admin/pages
 *
 * Admin only. Returns all custom pages (including unpublished) for management.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const pages = await db.customPage.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    })
    return json({ pages })
  } catch (e) { return handleError(e) }
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().max(200).optional(),
  // BlockNote JSON content (array of block objects). Stored as Json in DB.
  content: z.any().nullable().optional(),
  htmlContent: z.string().default(''),
  language: z.string().max(10).optional(),
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(500).nullable().optional(),
  focusKeyword: z.string().max(100).nullable().optional(),
  canonicalUrl: z.string().url().nullable().optional(),
  noIndex: z.boolean().default(false),
  isPublished: z.boolean().default(false),
})

/**
 * POST /api/admin/pages
 *
 * Admin only. Creates a new custom page. Slug is auto-generated from the
 * title if not provided, and de-duplicated with a numeric suffix.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const body = await parseBody(req, createSchema)

    const baseSlug = body.slug ? slugify(body.slug) : slugify(body.title)
    if (!baseSlug) return error(400, 'Could not generate a valid slug from the title')
    const slug = await ensureUniqueSlug(baseSlug, body.language || 'en')

    const page = await db.customPage.create({
      data: {
        title: body.title,
        slug,
        content: body.content ?? null,
        language: body.language ?? 'en',
        htmlContent: body.htmlContent,
        seoTitle: body.seoTitle ?? null,
        seoDescription: body.seoDescription ?? null,
        focusKeyword: body.focusKeyword ?? null,
        canonicalUrl: body.canonicalUrl ?? null,
        noIndex: body.noIndex,
        isPublished: body.isPublished,
      },
    })
    return json({ page }, 201)
  } catch (e) { return handleError(e) }
}

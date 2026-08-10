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
    .replace(/[^\w\s-]/g, '')     // remove non-word chars (keep letters, digits, spaces, hyphens)
    .replace(/[\s_]+/g, '-')      // spaces/underscores → hyphen
    .replace(/-+/g, '-')          // collapse multiple hyphens
    .replace(/^-+|-+$/g, '')      // trim leading/trailing hyphens
}

/** Ensure a slug is unique by appending -2, -3, etc. if needed. */
async function ensureUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug
  let n = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db.blogPost.findUnique({
      where: { slug },
      select: { id: true },
    })
    if (!existing || existing.id === excludeId) return slug
    n++
    slug = `${baseSlug}-${n}`
  }
}

/**
 * GET /api/admin/blog
 *
 * Admin only. Returns all blog posts (including DRAFTs) for management,
 * ordered by most recently updated. Includes the author's name.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const posts = await db.blogPost.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    })
    return json({ posts })
  } catch (e) { return handleError(e) }
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().max(200).optional(),      // auto-generated from title if omitted
  excerpt: z.string().max(500).default(''),
  content: z.any().default({ type: 'doc', content: [{ type: 'paragraph' }] }), // TipTap JSON
  coverImage: z.string().url().nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
})

/**
 * POST /api/admin/blog
 *
 * Admin only. Creates a new blog post. The slug is auto-generated from the
 * title (kebab-case) if not provided, and de-duplicated with a numeric suffix
 * if a post with that slug already exists.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'ADMIN') return error(403, 'Admin only')

    const body = await parseBody(req, createSchema)

    const baseSlug = body.slug ? slugify(body.slug) : slugify(body.title)
    if (!baseSlug) return error(400, 'Could not generate a valid slug from the title')
    const slug = await ensureUniqueSlug(baseSlug)

    const post = await db.blogPost.create({
      data: {
        title: body.title,
        slug,
        excerpt: body.excerpt,
        content: body.content,
        coverImage: body.coverImage ?? null,
        authorId: session.id,
        status: body.status,
      },
      include: { author: { select: { id: true, name: true, email: true } } },
    })
    return json({ post }, 201)
  } catch (e) { return handleError(e) }
}

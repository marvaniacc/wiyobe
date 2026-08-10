import { db } from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { generateHTML } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TiptapLink from '@tiptap/extension-link'
import { formatDate } from '@/lib/money'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

type PostDetail = {
  id: string
  title: string
  slug: string
  excerpt: string
  content: unknown
  coverImage: string | null
  createdAt: Date
  updatedAt: Date
  author: { name: string | null; email: string } | null
}

/**
 * Fetch a single published blog post by slug for public rendering.
 * Drafts and non-existent slugs trigger a 404 via notFound().
 */
async function getPost(slug: string): Promise<PostDetail | null> {
  const post = await db.blogPost.findUnique({
    where: { slug },
    include: {
      author: { select: { name: true, email: true } },
    },
  })
  // Only published posts are publicly accessible.
  if (!post || post.status !== 'PUBLISHED') return null
  return post as PostDetail
}

/**
 * Convert the stored TipTap JSON content to an HTML string for SSR rendering.
 * Uses the same extensions as the admin editor (StarterKit, Image, Link) so
 * every node type renders consistently. Malformed JSON falls back to a
 * simple paragraph so the page never crashes.
 */
function renderContent(content: unknown): string {
  try {
    if (!content || typeof content !== 'object') {
      return '<p><em>This post has no content.</em></p>'
    }
    return generateHTML(content as any, [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Image.configure({ inline: false, allowBase64: true }),
      TiptapLink.configure({
        openOnClick: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank', class: 'text-primary underline' },
      }),
    ])
  } catch (e) {
    console.error('[blog render] Failed to generate HTML from TipTap JSON:', e)
    return '<p><em>This post content could not be displayed.</em></p>'
  }
}

/**
 * Generate dynamic SEO metadata for each blog post. This runs on the server
 * and populates <title>, meta description, and Open Graph / Twitter Card
 * tags so search engines and social media link previews work correctly.
 *
 * Returns minimal fallback metadata when the post is not found (Next.js will
 * then render the notFound() page).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) {
    return { title: 'Post not found — Wishubest Blog' }
  }

  const url = `/blog/${post.slug}`
  const images = post.coverImage ? [{ url: post.coverImage, width: 1200, height: 630, alt: post.title }] : undefined

  return {
    title: `${post.title} — Wishubest Blog`,
    description: post.excerpt || post.title,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.excerpt || post.title,
      type: 'article',
      url,
      publishedTime: post.createdAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      authors: post.author?.name ? [post.author.name] : undefined,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt || post.title,
      images,
    },
  }
}

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) notFound()

  const contentHtml = renderContent(post.content)
  const authorName = post.author?.name || post.author?.email || 'Wishubest'

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-divider bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
          <Link href="/blog" className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            <span>←</span>
            <span>All articles</span>
          </Link>
          <Link
            href="/"
            className="rounded-full border border-divider px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            Wishubest
          </Link>
        </div>
      </header>

      {/* Article */}
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Cover image */}
        {post.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImage}
            alt={post.title}
            className="mb-8 aspect-[16/9] w-full rounded-[16px] object-cover shadow-sm"
          />
        )}

        {/* Title */}
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{post.title}</h1>

        {/* Meta */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person</span>
            {authorName}
          </span>
          <span className="text-divider">·</span>
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>event</span>
            <time dateTime={post.createdAt.toISOString()}>{formatDate(post.createdAt.toISOString(), 'en')}</time>
          </span>
        </div>

        {/* Excerpt (lede) */}
        {post.excerpt && (
          <p className="mt-6 border-s-2 border-primary bg-primary/5 p-4 text-base italic text-muted-foreground">
            {post.excerpt}
          </p>
        )}

        {/* Content — rendered TipTap JSON as HTML, styled with prose */}
        <div
          className="prose prose-lg mt-8 max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-img:rounded-[12px] prose-blockquote:border-s-primary prose-blockquote:bg-primary/5 prose-blockquote:py-1 prose-blockquote:ps-4 prose-li:my-1"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />

        {/* Back to blog */}
        <div className="mt-12 border-t border-divider pt-8">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <span>←</span>
            Back to all articles
          </Link>
        </div>
      </article>

      {/* Footer */}
      <footer className="border-t border-divider bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Wishubest — Global Medical Tourism Marketplace
          </p>
        </div>
      </footer>
    </div>
  )
}

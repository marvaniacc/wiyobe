import { db } from '@/lib/db'
import Link from 'next/link'
import { formatDate } from '@/lib/money'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Blog — Wishubest Medical Tourism',
  description:
    'Articles, guides, and insights about medical tourism, healthcare abroad, and planning your medical journey.',
  openGraph: {
    title: 'Wishubest Blog — Medical Tourism Articles',
    description:
      'Articles, guides, and insights about medical tourism, healthcare abroad, and planning your medical journey.',
    type: 'website',
  },
}

type PostCard = {
  id: string
  title: string
  slug: string
  excerpt: string
  coverImage: string | null
  createdAt: Date
  author: { name: string | null } | null
}

export default async function BlogListPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  // Fetch only published, non-soft-deleted posts, newest first. Select only
  // the fields needed for the card grid — the full TipTap JSON content is NOT
  // loaded here.
  const posts: PostCard[] = await db.blogPost.findMany({
    where: { status: 'PUBLISHED', deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      coverImage: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  })

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-divider bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
          <Link href={`/${locale}`} className="flex items-center gap-2 text-lg font-semibold text-foreground transition-colors hover:text-primary">
            <span className="text-primary">↩</span>
            <span>Wishubest</span>
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full border border-divider px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            Back to app
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-divider bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Medical Tourism Blog
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Guides, insights, and stories about healthcare abroad — from choosing the right
            destination to preparing for your medical journey.
          </p>
        </div>
      </section>

      {/* Posts grid */}
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[16px] border border-dashed border-divider bg-surface py-16 text-center">
            <span className="material-symbols-outlined text-4xl text-muted-foreground/50" style={{ fontSize: 48 }}>
              article
            </span>
            <h2 className="text-lg font-semibold text-foreground">No articles yet</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Check back soon — our team is working on helpful articles about medical tourism.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/${locale}/blog/${post.slug}`}
                className="group flex flex-col overflow-hidden rounded-[16px] border border-divider bg-surface transition-all hover:border-primary/30 hover:shadow-lg"
              >
                {/* Cover image */}
                {post.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.coverImage}
                    alt={post.title}
                    className="aspect-[16/9] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                    <span className="material-symbols-outlined text-primary/30" style={{ fontSize: 40 }}>
                      article
                    </span>
                  </div>
                )}

                {/* Body */}
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="line-clamp-2 text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">{post.excerpt}</p>
                  )}
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      event
                    </span>
                    <time dateTime={post.createdAt.toISOString()}>{formatDate(post.createdAt.toISOString(), locale)}</time>
                    {post.author?.name && (
                      <>
                        <span className="text-divider">·</span>
                        <span>{post.author.name}</span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

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

import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Dynamic sitemap.xml — generated via Next.js App Router native metadata.
 *
 * Includes:
 *  - Static routes: landing page (/) and blog list (/blog)
 *  - Dynamic routes: one entry per published blog post (/blog/[slug])
 *
 * Fetches directly from Prisma (no internal API calls) so the sitemap is
 * always up-to-date with the database state.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Base URL — falls back to localhost for dev if the env var is not set.
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')

  const entries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ]

  // Fetch only the fields needed for sitemap generation.
  const posts = await db.blogPost.findMany({
    where: { status: 'PUBLISHED' },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  })

  for (const post of posts) {
    entries.push({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    })
  }

  return entries
}

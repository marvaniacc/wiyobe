import type { MetadataRoute } from 'next'

/**
 * robots.txt — generated via Next.js App Router native metadata.
 *
 * - Allows all crawlers to access public pages.
 * - Disallows /api/ routes (internal APIs should not be indexed).
 * - Points crawlers to the dynamic sitemap.xml.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}

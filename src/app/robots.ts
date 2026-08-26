import type { MetadataRoute } from 'next'

/**
 * robots.txt — generated via Next.js App Router native metadata.
 *
 * - Allows all crawlers to access public pages.
 * - Disallows /api/ routes (internal APIs should not be indexed).
 * - Points crawlers to the dynamic sitemap.xml.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')

  // Admin can block all crawlers via the allowSearchIndexing SiteSetting.
  let disallow: string[] = ['/api/', '/dashboard']
  try {
    const { getSetting } = await import('@/lib/site-settings')
    if ((await getSetting('allowSearchIndexing')) === 'false') {
      disallow = ['/']
    }
  } catch { /* default rules */ }

  return {
    rules: [
      {
        userAgent: '*',
        ...(disallow.includes('/') ? { disallow: '/' } : { allow: '/', disallow }),
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}

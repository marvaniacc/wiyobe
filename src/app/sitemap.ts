import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { getCountrySlug } from '@/lib/countries'
import { SHOW_LEGACY_PROVIDER_TYPES } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

const SUPPORTED_LOCALES = ['en', 'tr', 'fa', 'ar', 'ru']

/**
 * Dynamic sitemap.xml — generated via Next.js App Router native metadata.
 *
 * Includes URLs for ALL supported locales:
 *  - Locale landing pages (/{locale})
 *  - Blog list (/{locale}/blog)
 *  - Blog posts (/{locale}/blog/{slug})
 *  - Published custom pages (/{locale}/{slug})
 *  - Provider type listings (/{locale}/doctors, plus /hospitals, /hotels,
 *    /translators when SHOW_LEGACY_PROVIDER_TYPES is ON)
 *  - Country-filtered provider listings (/{locale}/doctors/{country})
 *  - Individual provider detail pages (/{locale}/doctors/{country}/{slug})
 *  - Dashboard (/dashboard) — excluded (noindex)
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Base URL is dynamic via NEXT_PUBLIC_APP_URL (set in Vercel env vars).
  // Falls back to localhost for local dev only.
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  const now = new Date()

  const entries: MetadataRoute.Sitemap = []

  // === Static pages per locale ===
  for (const locale of SUPPORTED_LOCALES) {
    // Locale landing
    entries.push({
      url: `${baseUrl}/${locale}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    })

    // Blog list
    entries.push({
      url: `${baseUrl}/${locale}/blog`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    })

    // Provider type listings — legacy types (hospitals/hotels/translators)
    // are only emitted when SHOW_LEGACY_PROVIDER_TYPES is ON.
    const providerTypeSlugs = SHOW_LEGACY_PROVIDER_TYPES
      ? ['doctors', 'hospitals', 'hotels', 'translators']
      : ['doctors']
    for (const pt of providerTypeSlugs) {
      entries.push({
        url: `${baseUrl}/${locale}/${pt}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    }

    // Static info / legal pages (P5/P6 additions)
    for (const page of ['about', 'faq', 'contact', 'terms', 'privacy']) {
      entries.push({
        url: `${baseUrl}/${locale}/${page}`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.5,
      })
    }
  }

  // === Blog posts (all locales) ===
  const posts = await db.blogPost.findMany({
    where: { status: 'PUBLISHED', deletedAt: null },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  })

  for (const post of posts) {
    for (const locale of SUPPORTED_LOCALES) {
      entries.push({
        url: `${baseUrl}/${locale}/blog/${post.slug}`,
        lastModified: post.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    }
  }

  // === Published custom pages (all locales) ===
  const customPages = await db.customPage.findMany({
    where: { isPublished: true, deletedAt: null },
    select: { slug: true, updatedAt: true },
  })

  for (const page of customPages) {
    if (page.slug === 'home') continue // home is the locale landing
    for (const locale of SUPPORTED_LOCALES) {
      entries.push({
        url: `${baseUrl}/${locale}/${page.slug}`,
        lastModified: page.updatedAt,
        changeFrequency: 'monthly',
        priority: 0.6,
      })
    }
  }

  // === Provider detail pages (all locales) ===
  // Doctors
  const doctors = await db.doctor.findMany({
    where: { verified: true, slug: { not: null }, user: { kycStatus: 'APPROVED' } },
    select: { slug: true, country: true, updatedAt: true, locations: { select: { country: true, countrySlug: true } } },
  })
  for (const doc of doctors) {
    const countries = new Set<string>()
    if (doc.country) countries.add(doc.country)
    for (const loc of doc.locations) {
      if (loc.country) countries.add(loc.country)
    }
    for (const countryCode of countries) {
      const countrySlug = getCountrySlug(countryCode) || countries.values().next().value
      if (!countrySlug || !doc.slug) continue
      for (const locale of SUPPORTED_LOCALES) {
        entries.push({
          url: `${baseUrl}/${locale}/doctors/${countrySlug}/${doc.slug}`,
          lastModified: doc.updatedAt,
          changeFrequency: 'weekly',
          priority: 0.7,
        })
      }
    }
  }

  // === Legacy provider detail pages — only emitted when
  // SHOW_LEGACY_PROVIDER_TYPES is ON (flag OFF: search engines no longer
  // discover legacy listings; existing URLs keep resolving) ===
  if (SHOW_LEGACY_PROVIDER_TYPES) {
    // Hospitals
    const hospitals = await db.hospital.findMany({
      where: { verified: true, slug: { not: null }, user: { kycStatus: 'APPROVED' } },
      select: { slug: true, country: true, updatedAt: true, locations: { select: { country: true, countrySlug: true } } },
    })
    for (const hosp of hospitals) {
      const countries = new Set<string>()
      if (hosp.country) countries.add(hosp.country)
      for (const loc of hosp.locations) {
        if (loc.country) countries.add(loc.country)
      }
      for (const countryCode of countries) {
        const countrySlug = getCountrySlug(countryCode)
        if (!countrySlug || !hosp.slug) continue
        for (const locale of SUPPORTED_LOCALES) {
          entries.push({
            url: `${baseUrl}/${locale}/hospitals/${countrySlug}/${hosp.slug}`,
            lastModified: hosp.updatedAt,
            changeFrequency: 'weekly',
            priority: 0.7,
          })
        }
      }
    }

    // Hotels (no ProviderLocation — use primary country only)
    const hotels = await db.hotel.findMany({
      where: { verified: true, slug: { not: null }, user: { kycStatus: 'APPROVED' } },
      select: { slug: true, country: true, updatedAt: true },
    })
    for (const hotel of hotels) {
      const countrySlug = getCountrySlug(hotel.country)
      if (!countrySlug || !hotel.slug) continue
      for (const locale of SUPPORTED_LOCALES) {
        entries.push({
          url: `${baseUrl}/${locale}/hotels/${countrySlug}/${hotel.slug}`,
          lastModified: hotel.updatedAt,
          changeFrequency: 'weekly',
          priority: 0.7,
        })
      }
    }

    // Translators
    const translators = await db.translator.findMany({
      where: { verified: true, slug: { not: null }, user: { kycStatus: 'APPROVED' } },
      select: { slug: true, country: true, updatedAt: true, locations: { select: { country: true, countrySlug: true } } },
    })
    for (const tr of translators) {
      const countries = new Set<string>()
      if (tr.country) countries.add(tr.country)
      for (const loc of tr.locations) {
        if (loc.country) countries.add(loc.country)
      }
      for (const countryCode of countries) {
        const countrySlug = getCountrySlug(countryCode)
        if (!countrySlug || !tr.slug) continue
        for (const locale of SUPPORTED_LOCALES) {
          entries.push({
            url: `${baseUrl}/${locale}/translators/${countrySlug}/${tr.slug}`,
            lastModified: tr.updatedAt,
            changeFrequency: 'weekly',
            priority: 0.7,
          })
        }
      }
    }
  } // end SHOW_LEGACY_PROVIDER_TYPES

  return entries
}

import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/portal/', '/nastavnik/'],
      },
    ],
    sitemap: 'https://udruga-inovatic.hr/sitemap.xml',
    host: 'https://udruga-inovatic.hr',
  }
}

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
})

const siteUrl = 'https://udruga-inovatic.hr'

export const metadata: Metadata = {
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
  title: {
    default: 'Inovatic – LEGO Robotika za djecu u Splitu',
    template: '%s | Inovatic',
  },
  description:
    'Udruga za robotiku "Inovatic" – učimo djecu od 6 do 14 godina STEM vještine i programiranje kroz LEGO robotiku u Splitu. Tečajevi SLR 1–4, dvije lokacije.',
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: 'website',
    locale: 'hr_HR',
    url: siteUrl,
    siteName: 'Inovatic – Udruga za robotiku Split',
    title: 'Inovatic – LEGO Robotika za djecu u Splitu',
    description:
      'Učimo djecu od 6 do 14 godina STEM vještine kroz LEGO robotiku u Splitu.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Inovatic – Udruga za robotiku Split',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Inovatic – LEGO Robotika za djecu u Splitu',
    description: 'Učimo djecu od 6 do 14 godina STEM vještine kroz LEGO robotiku u Splitu.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

const localBusinessJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'EducationalOrganization',
  '@id': `${siteUrl}/#organization`,
  name: 'Udruga za robotiku "Inovatic"',
  alternateName: 'Inovatic',
  url: siteUrl,
  logo: `${siteUrl}/images/logo_dark.png`,
  telephone: '+385993936993',
  email: 'info@udruga-inovatic.hr',
  foundingDate: '2014',
  description:
    'Udruga za robotiku koja educira djecu od 6 do 14 godina kroz LEGO WeDo 2.0 i Spike Prime programe u Splitu.',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Velebitska 32',
    addressLocality: 'Split',
    postalCode: '21000',
    addressCountry: 'HR',
  },
  location: [
    {
      '@type': 'Place',
      name: 'Velebitska 32',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Velebitska 32',
        addressLocality: 'Split',
        postalCode: '21000',
        addressCountry: 'HR',
      },
      geo: { '@type': 'GeoCoordinates', latitude: 43.5111, longitude: 16.4497 },
    },
    {
      '@type': 'Place',
      name: 'Ruđera Boškovića 33',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Ruđera Boškovića 33',
        addressLocality: 'Split',
        postalCode: '21000',
        addressCountry: 'HR',
      },
      geo: { '@type': 'GeoCoordinates', latitude: 43.5089, longitude: 16.4511 },
    },
  ],
  sameAs: [
    'https://facebook.com/udrugainovatic',
    'https://instagram.com/udruga_inovatic',
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="hr" className={inter.variable}>
      <body className="antialiased min-h-screen">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
        />
        {children}
      </body>
    </html>
  )
}

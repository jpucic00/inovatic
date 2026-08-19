import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { CITIES, LOCATIONS } from '@/lib/locations'

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
})

const siteUrl = 'https://udruga-inovatic.hr'

export const metadata: Metadata = {
  title: {
    default: 'Inovatic – LEGO Robotika za djecu',
    template: '%s | Inovatic',
  },
  description:
    'Udruga za robotiku "Inovatic" – učimo djecu od 6 do 14 godina STEM vještine i programiranje kroz LEGO robotiku u Splitu i Šibeniku. Tečajevi SLR 1–4, tri lokacije.',
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: 'website',
    locale: 'hr_HR',
    url: siteUrl,
    siteName: 'Inovatic – Udruga za robotiku',
    title: 'Inovatic – LEGO Robotika za djecu',
    description:
      'Učimo djecu od 6 do 14 godina STEM vještine kroz LEGO robotiku u Splitu i Šibeniku.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Inovatic – LEGO Robotika za djecu',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Inovatic – LEGO Robotika za djecu',
    description: 'Učimo djecu od 6 do 14 godina STEM vještine kroz LEGO robotiku u Splitu i Šibeniku.',
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
  areaServed: [
    { '@type': 'City', name: 'Split' },
    { '@type': 'City', name: 'Šibenik' },
  ],
  description:
    'Udruga za robotiku koja educira djecu od 6 do 14 godina kroz LEGO WeDo 2.0 i Spike Prime programe u Splitu i Šibeniku.',
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
      geo: { '@type': 'GeoCoordinates', latitude: 43.5163792, longitude: 16.4560215 },
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
    {
      '@type': 'Place',
      name: 'Trokut inkubator',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Velimira Škorpika 7/a',
        addressLocality: 'Šibenik',
        postalCode: '22000',
        addressCountry: 'HR',
      },
      geo: { '@type': 'GeoCoordinates', latitude: 43.71615, longitude: 15.90774 },
    },
  ],
  // Both cities' pages — Google reads sameAs as "this organisation's own
  // profiles", and leaving Šibenik's out leaves them unattributed.
  sameAs: CITIES.flatMap((c) => [
    LOCATIONS[c.slug].social.facebook,
    LOCATIONS[c.slug].social.instagram,
  ]),
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
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

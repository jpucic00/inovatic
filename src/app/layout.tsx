import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: {
    default: 'Inovatic – Udruga za robotiku Split',
    template: '%s | Inovatic',
  },
  description:
    'Udruga za robotiku "Inovatic" – učimo djecu od 6 do 14 godina STEM vještine i programiranje kroz LEGO robotiku u Splitu.',
  metadataBase: new URL('https://udruga-inovatic.hr'),
  openGraph: {
    type: 'website',
    locale: 'hr_HR',
    url: 'https://udruga-inovatic.hr',
    siteName: 'Inovatic',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="hr" className={inter.variable}>
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  )
}

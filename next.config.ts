import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'udruga-inovatic.hr' },
    ],
  },
  async redirects() {
    // /kontakt was split into per-city pages under /lokacije. Keep the old URL
    // working (already-sent emails, external inbound links) with a permanent 308.
    return [
      { source: '/kontakt', destination: '/lokacije', permanent: true },
    ]
  },
}

export default nextConfig

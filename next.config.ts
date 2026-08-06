import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
  async redirects() {
    // /kontakt was split into per-city pages under /lokacije. Keep the old URL
    // working (already-sent emails, external inbound links) with a permanent 308.
    // The signup form moved /upisi → /prijava (login moved /prijava → /portal);
    // re-enrollment invitations already mailed out carry /upisi/<slug> links.
    return [
      { source: '/kontakt', destination: '/lokacije', permanent: true },
      { source: '/upisi', destination: '/prijava', permanent: true },
      { source: '/upisi/:slug', destination: '/prijava/:slug', permanent: true },
    ]
  },
}

export default nextConfig

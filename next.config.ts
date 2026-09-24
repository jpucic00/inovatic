import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // Renders PDFs with its own React reconciler — bundling it into the server
  // layer would hand it the react-server build, which has no reconciler.
  serverExternalPackages: ['@react-pdf/renderer'],
  // The raspored PDF reads its fonts and logo from disk at runtime; a path
  // built with `path.join` is invisible to the standalone trace, so without
  // these the production image renders without them (or not at all).
  outputFileTracingIncludes: {
    '/api/admin/school-year-calendar': ['./src/assets/fonts/**/*', './public/images/logo_dark.png'],
    '/admin/email': ['./src/assets/fonts/**/*', './public/images/logo_dark.png'],
  },
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

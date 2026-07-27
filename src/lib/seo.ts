import type { Metadata } from 'next'

/**
 * Next.js shallow-merges metadata: a page that declares its own `openGraph`
 * block replaces the root layout's object outright, silently dropping
 * site_name/locale/type. Spread this first in every page-level `openGraph`.
 */
export const OG_DEFAULTS = {
  type: 'website',
  locale: 'hr_HR',
  siteName: 'Inovatic – Udruga za robotiku',
} satisfies Metadata['openGraph']

import Script from 'next/script'
import { UMAMI_INTERNAL_PATH_PATTERN } from '@/lib/umami'

/**
 * Umami tracker, mounted only in the (public) layout. Renders nothing unless
 * both env vars are set, so local dev and previews stay untracked unless
 * explicitly opted in. NEXT_PUBLIC_UMAMI_DOMAINS additionally restricts the
 * tracker to the production hostname(s).
 *
 * The before-send handler is a plain inline script (parsed before the deferred
 * tracker executes) that drops any pageview/event whose URL is an internal
 * section — see UMAMI_INTERNAL_PATH_PATTERN. Requires Umami ≥ 2.18.
 */
export function UmamiAnalytics() {
  const scriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
  if (!scriptUrl || !websiteId) return null

  const domains = process.env.NEXT_PUBLIC_UMAMI_DOMAINS
  const beforeSend =
    'window.__umamiBeforeSend=function(type,payload){' +
    `try{if(payload&&payload.url&&new RegExp(${JSON.stringify(UMAMI_INTERNAL_PATH_PATTERN)})` +
    '.test(new URL(payload.url,window.location.origin).pathname))return false}catch(e){}' +
    'return payload};'

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: beforeSend }} />
      <Script
        src={scriptUrl}
        data-website-id={websiteId}
        data-before-send="__umamiBeforeSend"
        {...(domains ? { 'data-domains': domains } : {})}
        strategy="afterInteractive"
      />
    </>
  )
}

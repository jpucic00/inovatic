/**
 * Umami analytics helpers. The tracker script is mounted by <UmamiAnalytics>
 * in the (public) layout; client components fire conversion events through
 * trackUmamiEvent so the tracker stays an optional, env-driven dependency.
 */

/**
 * Pathname pattern for internal sections that must never be tracked. Mounting
 * the tracker only in the (public) layout is not enough on its own: the script
 * tag survives client-side navigation into /prijava → /admin etc., so the
 * data-before-send guard drops these even while the tracker stays loaded.
 */
export const UMAMI_INTERNAL_PATH_PATTERN = '^/(?:admin|nastavnik|portal|prijava|api)(?:/|$)'

type UmamiEventData = Record<string, string | number | boolean>

declare global {
  interface Window {
    umami?: { track: (event: string, data?: UmamiEventData) => void }
  }
}

/**
 * Fire a custom Umami event. Safe no-op when the tracker is absent (env vars
 * unset, ad blocker, or an internal page). Never put personal data in `data`.
 */
export function trackUmamiEvent(event: string, data?: UmamiEventData): void {
  if (typeof window === 'undefined') return
  window.umami?.track(event, data)
}

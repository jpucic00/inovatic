import { headers } from 'next/headers'

/**
 * The caller's address for rate limiting: the first hop of `x-forwarded-for`,
 * which Railway's proxy sets. Unknown clients share one bucket — a limiter
 * that fails that way is stricter, never looser.
 */
export function ipFromForwardedFor(value: string | null | undefined): string {
  return value?.split(',')[0]?.trim() || 'unknown'
}

/** {@link ipFromForwardedFor} for code running inside a request (actions, pages). */
export async function clientIp(): Promise<string> {
  return ipFromForwardedFor((await headers()).get('x-forwarded-for'))
}

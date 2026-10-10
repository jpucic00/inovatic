import { headers } from 'next/headers'

/**
 * The caller's address for rate limiting: `x-real-ip`, which Railway's edge
 * overwrites on every request. Measured on production 2026-10-10 (Flux
 * 3thglb6): a forged `X-Forwarded-For` never reached the app, and `x-real-ip`
 * held the real client. Cloudflare is DNS-only, so nothing sits in front of the
 * edge — turning its proxy on would change this and needs a new measurement.
 * Unknown clients share one bucket — a limiter that fails that way is
 * stricter, never looser.
 */
export function clientIpFrom(headers: Pick<Headers, 'get'>): string {
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

/** {@link clientIpFrom} for code running inside a request (actions, pages). */
export async function clientIp(): Promise<string> {
  return clientIpFrom(await headers())
}

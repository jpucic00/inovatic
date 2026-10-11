import { headers } from 'next/headers'

/**
 * The caller's address for rate limiting: `x-real-ip`, which Railway's edge
 * overwrites on every request. Measured on production 2026-10-10 (Flux
 * 3thglb6): a forged `X-Forwarded-For` never reached the app, and `x-real-ip`
 * held the real client. Cloudflare is DNS-only, so nothing sits in front of the
 * edge — turning its proxy on would change this and needs a new measurement.
 * Unknown clients share one bucket — a limiter that fails that way is
 * stricter, never looser. In production that would mean the edge stopped
 * setting the header, and every visitor then shares one login throttle, so it
 * is logged once per process; locally there is no edge and nothing is logged.
 */
export function clientIpFrom(headers: Pick<Headers, 'get'>): string {
  const ip = headers.get('x-real-ip')?.trim()
  if (ip) return ip
  if (!warnedMissingIp && process.env.NODE_ENV === 'production') {
    warnedMissingIp = true
    console.warn('[client-ip] request without x-real-ip — rate limits fall back to one shared bucket')
  }
  return 'unknown'
}

let warnedMissingIp = false

/** {@link clientIpFrom} for code running inside a request (actions, pages). */
export async function clientIp(): Promise<string> {
  return clientIpFrom(await headers())
}

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

/**
 * The raw headers that could name the client, verbatim. Diagnostic only
 * (Flux 3thglb6): we do not yet know whether the Railway edge — or a Cloudflare
 * proxy in front of it — overwrites a client-sent `x-forwarded-for` or appends
 * to it. Logged when a login lock engages so one deliberate test on production
 * shows which header carries the real address; remove or keep once decided.
 */
export type IpEvidence = {
  forwardedFor: string | null
  realIp: string | null
  cfConnectingIp: string | null
}

export function ipEvidenceFrom(headers: Headers): IpEvidence {
  return {
    forwardedFor: headers.get('x-forwarded-for'),
    realIp: headers.get('x-real-ip'),
    cfConnectingIp: headers.get('cf-connecting-ip'),
  }
}

const EVIDENCE_VALUE_MAX = 200

/** Every value is client-controlled, so CR/LF are dropped (no forged log
 *  lines) and each is capped; `-` marks a header that was not sent at all. */
function evidenceValue(value: string | null): string {
  if (value === null) return '-'
  return value.replace(/[\r\n]/g, '').slice(0, EVIDENCE_VALUE_MAX)
}

export function formatIpEvidence(evidence: IpEvidence | undefined): string {
  return [
    `x-forwarded-for=${evidenceValue(evidence?.forwardedFor ?? null)}`,
    `x-real-ip=${evidenceValue(evidence?.realIp ?? null)}`,
    `cf-connecting-ip=${evidenceValue(evidence?.cfConnectingIp ?? null)}`,
  ].join(' ')
}

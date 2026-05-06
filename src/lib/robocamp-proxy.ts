const ROBOCAMP_HOST = 'elearning.robocamp.eu'

export function isRobocampUrl(url: string): boolean {
  try {
    return new URL(url).hostname === ROBOCAMP_HOST
  } catch {
    return false
  }
}

export function toProxyUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== ROBOCAMP_HOST) return null
    return `/api/proxy/elearning${parsed.pathname}${parsed.search}`
  } catch {
    return null
  }
}

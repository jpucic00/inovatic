'use client'

import { toProxyUrl } from '@/lib/robocamp-proxy'

export function RobocampEmbed({ url, title }: { url: string; title?: string }) {
  const proxied = toProxyUrl(url)
  if (!proxied) return null

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white">
      <iframe
        src={proxied}
        title={title ?? 'RoboCamp materijal'}
        className="w-full border-0"
        style={{ height: 880, overflow: 'hidden' }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  )
}

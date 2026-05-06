/**
 * Convert a YouTube/Vimeo watch URL into an embeddable iframe src. Returns
 * null for unrecognised hosts; callers should fall back to a plain link.
 */
export function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()

    // youtu.be/<id>
    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }

    // youtube.com/watch?v=ID  OR  /embed/ID  OR  /shorts/ID
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      if (u.pathname === '/watch') {
        const v = u.searchParams.get('v')
        return v ? `https://www.youtube.com/embed/${v}` : null
      }
      const match = u.pathname.match(/^\/(?:embed|shorts)\/([^/?#]+)/)
      if (match) return `https://www.youtube.com/embed/${match[1]}`
      return null
    }

    // vimeo.com/<id>
    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null
    }

    return null
  } catch {
    return null
  }
}

export function VideoEmbed({ url, title }: { url: string; title?: string }) {
  const embed = toEmbedUrl(url)
  if (!embed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-cyan-700 hover:underline text-sm"
      >
        {title ?? url}
      </a>
    )
  }
  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ paddingTop: '56.25%' }}>
      <iframe
        src={embed}
        title={title ?? 'Video'}
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  )
}

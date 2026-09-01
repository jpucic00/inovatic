/**
 * Walk BlockNote `PartialBlock[]` JSON content and collect every image/video
 * URL found in block props. Used during article deletion to clean up uploaded
 * Cloudinary assets.
 *
 * Kept permissive (unknown input) because this runs on stored JSON that may
 * have been migrated from WordPress or earlier schemas.
 */
export function extractImageUrls(content: unknown): string[] {
  const urls: string[] = []

  function visit(node: unknown): void {
    if (!node) return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (typeof node !== 'object') return

    const block = node as {
      type?: string
      props?: { url?: unknown }
      content?: unknown
      children?: unknown
    }

    if (
      (block.type === 'image' || block.type === 'video') &&
      typeof block.props?.url === 'string' &&
      block.props.url.length > 0
    ) {
      urls.push(block.props.url)
    }

    if (block.children) visit(block.children)
  }

  visit(content)
  return urls
}

/**
 * Return a copy of BlockNote `content` with every IMAGE block's url passed
 * through `fn`. Video blocks are deliberately left alone — the watermark is an
 * image-only feature, and overlaying a video is a much heavier transformation
 * than the association has any need for.
 *
 * Same permissive walk as `extractImageUrls`, for the same reason: this runs on
 * stored JSON that may predate the current editor.
 */
export function mapImageUrls(content: unknown, fn: (url: string) => string): unknown {
  function visit(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(visit)
    if (!node || typeof node !== 'object') return node

    const block = node as {
      type?: string
      props?: { url?: unknown }
      children?: unknown
    }
    const next: Record<string, unknown> = { ...(node as Record<string, unknown>) }

    if (
      block.type === 'image' &&
      typeof block.props?.url === 'string' &&
      block.props.url.length > 0
    ) {
      next.props = { ...block.props, url: fn(block.props.url) }
    }
    if (block.children) next.children = visit(block.children)

    return next
  }

  return visit(content)
}

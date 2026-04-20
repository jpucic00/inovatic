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

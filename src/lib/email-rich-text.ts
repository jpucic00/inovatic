/**
 * The shape an /admin/email message body has once the composer formats it, and
 * the pure rules every consumer of that shape shares.
 *
 * These types are STRUCTURAL twins of BlockNote's own, not re-exports of them:
 * the e-mail templates under `emails/` and the Zod validator both read this
 * module, and neither may pull the editor (a ~500 kB client-only bundle) into
 * its graph. The editor is the only place that speaks BlockNote; everything
 * downstream speaks this.
 *
 * Deliberately a SUBSET. Images, video and tables are absent from the schema
 * the composer builds, so they are absent here — mail clients render them
 * inconsistently at best, and an image would additionally need an upload path
 * and an absolute URL. If one is ever wanted, it is a new block type here
 * first.
 */

/**
 * The three size steps offered in the composer, resolved to the px the mail
 * carries inline. Normal is the ABSENCE of the style, not a value in this map —
 * that keeps an unstyled run rendering at the layout's own 15px, so retuning
 * the base size does not strand every previously written message at a hardcoded
 * one. A three-step picker rather than a free number: a parent-facing mail does
 * not need typographic control, and three steps behave predictably everywhere.
 */
export const EMAIL_FONT_SIZES = {
  sm: '13px',
  lg: '19px',
} as const

type EmailFontSize = keyof typeof EMAIL_FONT_SIZES

function isEmailFontSize(value: unknown): value is EmailFontSize {
  return typeof value === 'string' && value in EMAIL_FONT_SIZES
}

/**
 * `strike` — NOT `strikethrough`. That is BlockNote's own key for the style and
 * what lands in the stored JSON; a renderer reading the other spelling silently
 * drops the formatting instead of failing.
 */
export interface EmailInlineStyles {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  fontSize?: EmailFontSize
}

export interface EmailStyledText {
  type: 'text'
  text: string
  styles: EmailInlineStyles
}

export interface EmailLink {
  type: 'link'
  href: string
  content: EmailStyledText[]
}

export type EmailInline = EmailStyledText | EmailLink

const EMAIL_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'bulletListItem',
  'numberedListItem',
] as const

export type EmailBlockType = (typeof EMAIL_BLOCK_TYPES)[number]

export interface EmailRichBlock {
  type: EmailBlockType
  /** Heading level 1–3; absent on every other block type. */
  props?: { level?: number }
  content: EmailInline[]
  /** Indented blocks — a nested bullet. */
  children?: EmailRichBlock[]
}

/**
 * Schemes a composed link may use. The body is admin-authored, but it leaves
 * the building and lands in mail clients we do not control, so the allowlist is
 * positive: `javascript:` and `data:` are the ones that matter, and enumerating
 * what is permitted cannot be outgrown by a scheme nobody thought to ban.
 *
 * A bare or protocol-relative href is refused too. Relative links are
 * meaningless in an inbox, and `//host/path` would resolve against a scheme the
 * mail client picks.
 */
const SAFE_HREF_SCHEMES = ['http:', 'https:', 'mailto:']

export function isSafeEmailHref(href: string): boolean {
  const trimmed = href.trim()
  if (trimmed.length === 0 || trimmed.length > 2000) return false
  try {
    return SAFE_HREF_SCHEMES.includes(new URL(trimmed).protocol)
  } catch {
    // Not absolute — nothing an inbox can follow.
    return false
  }
}

function inlineText(items: readonly EmailInline[]): string {
  return items
    .map((item) => (item.type === 'link' ? inlineText(item.content) : item.text))
    .join('')
}

function blockPrefix(block: EmailRichBlock, index: number): string {
  if (block.type === 'bulletListItem') return '• '
  if (block.type === 'numberedListItem') return `${index + 1}. `
  return ''
}

/**
 * The message with every mark stripped — what `EmailCampaign.bodyText` stores
 * alongside the blocks.
 *
 * It is not a leftover: the campaign history renders it, the composer's 5000
 * character limit is measured on it (a limit counting JSON would shrink as the
 * admin formatted, which reads as the editor eating their allowance), and a
 * campaign written before rich text existed has nothing else. Keeping it
 * readable rather than exact is the point — list markers are re-added because
 * a flattened bullet list without them is one run-on paragraph.
 */
export function flattenRichText(blocks: readonly EmailRichBlock[]): string {
  const lines: string[] = []

  const walk = (items: readonly EmailRichBlock[]) => {
    let ordinal = 0
    for (const block of items) {
      // Numbering restarts per run of list items, matching what the reader saw.
      ordinal = block.type === 'numberedListItem' ? ordinal + 1 : 0
      const text = inlineText(block.content).trim()
      if (text.length > 0) lines.push(`${blockPrefix(block, ordinal - 1)}${text}`)
      if (block.children && block.children.length > 0) walk(block.children)
    }
  }

  walk(blocks)
  return lines.join('\n')
}

/**
 * Narrow the `Json` Prisma hands back (or anything else untyped) to blocks the
 * renderer can walk, or null.
 *
 * Null is a real state and the whole reason this is defensive rather than a
 * cast: every campaign sent before this column existed has one, and so does any
 * row whose JSON no longer parses. The templates fall back to splitting
 * `bodyText` on newlines for exactly those, which is how an old campaign — and
 * a resumed send that was composed under the old composer — keeps rendering.
 */
export function parseRichBlocks(value: unknown): EmailRichBlock[] | null {
  if (!Array.isArray(value)) return null
  const blocks = value.map(normalizeBlock).filter((b): b is EmailRichBlock => b !== null)
  return blocks.length > 0 ? blocks : null
}

function normalizeBlock(value: unknown): EmailRichBlock | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const type = raw.type
  if (!EMAIL_BLOCK_TYPES.includes(type as EmailBlockType)) return null

  const content = Array.isArray(raw.content)
    ? raw.content.map(normalizeInline).filter((i): i is EmailInline => i !== null)
    : []
  const children = Array.isArray(raw.children)
    ? raw.children.map(normalizeBlock).filter((b): b is EmailRichBlock => b !== null)
    : []

  const block: EmailRichBlock = { type: type as EmailBlockType, content }
  if (children.length > 0) block.children = children

  const level = (raw.props as Record<string, unknown> | undefined)?.level
  if (type === 'heading' && typeof level === 'number') {
    block.props = { level }
  }
  return block
}

function normalizeStyles(value: unknown): EmailInlineStyles {
  if (typeof value !== 'object' || value === null) return {}
  const raw = value as Record<string, unknown>
  const styles: EmailInlineStyles = {}
  if (raw.bold === true) styles.bold = true
  if (raw.italic === true) styles.italic = true
  if (raw.underline === true) styles.underline = true
  if (raw.strike === true) styles.strike = true
  if (isEmailFontSize(raw.fontSize)) styles.fontSize = raw.fontSize
  return styles
}

function normalizeStyledText(value: unknown): EmailStyledText | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (raw.type !== 'text' || typeof raw.text !== 'string') return null
  return { type: 'text', text: raw.text, styles: normalizeStyles(raw.styles) }
}

function normalizeInline(value: unknown): EmailInline | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>

  if (raw.type === 'link') {
    // An unsafe href drops the LINK, never the words inside it: the sentence an
    // admin wrote must still reach the parent.
    const content = Array.isArray(raw.content)
      ? raw.content.map(normalizeStyledText).filter((t): t is EmailStyledText => t !== null)
      : []
    if (content.length === 0) return null
    if (typeof raw.href !== 'string' || !isSafeEmailHref(raw.href)) {
      return { type: 'text', text: content.map((c) => c.text).join(''), styles: {} }
    }
    return { type: 'link', href: raw.href.trim(), content }
  }

  return normalizeStyledText(value)
}

/** The composer's bounds, measured on the FLATTENED text — see `resolveEmailBody`. */
export const EMAIL_BODY_MIN_LENGTH = 10
export const EMAIL_BODY_MAX_LENGTH = 5000

type ResolvedEmailBody =
  | { ok: true; bodyText: string; bodyBlocks: EmailRichBlock[] | null }
  | { ok: false; error: string }

/**
 * Decide what a campaign actually stores, from whatever the composer submitted.
 *
 * The single place that answers it, called by the Zod validator and by the send
 * action alike. Splitting the two would let the payload past validation and
 * then be persisted in a different shape than the one that was checked — and
 * `bodyText` is not a field the client gets to assert: when blocks are present
 * it is RE-DERIVED here, so a body whose plain text says one thing and whose
 * formatting says another cannot exist. That is also what puts the length limit
 * on the text a parent will read rather than on the JSON encoding it, which
 * would otherwise shrink as the admin formatted.
 */
export function resolveEmailBody(input: {
  bodyText: string
  bodyBlocks?: unknown
}): ResolvedEmailBody {
  const blocks =
    input.bodyBlocks === undefined || input.bodyBlocks === null
      ? null
      : parseRichBlocks(input.bodyBlocks)

  // Submitted, but nothing survived normalization: the editor sent a document
  // made entirely of block types this schema does not carry. Falling back to
  // the client's own `bodyText` would silently mail a body nobody reviewed.
  if (input.bodyBlocks !== undefined && input.bodyBlocks !== null && blocks === null) {
    return { ok: false, error: 'Tekst poruke je obavezan.' }
  }

  const bodyText = (blocks ? flattenRichText(blocks) : input.bodyText).trim()

  if (bodyText.length < EMAIL_BODY_MIN_LENGTH) {
    return { ok: false, error: 'Tekst poruke je obavezan.' }
  }
  if (bodyText.length > EMAIL_BODY_MAX_LENGTH) {
    return { ok: false, error: `Maksimalno ${EMAIL_BODY_MAX_LENGTH} znakova.` }
  }

  return { ok: true, bodyText, bodyBlocks: blocks }
}

/**
 * Newline-separated plain text as blocks — one paragraph per line.
 *
 * The composer's kind presets are written as plain strings (they read as prose
 * in the source, which is the point of keeping them that way), and the editor
 * takes blocks. This is the one-way bridge; the inverse is `flattenRichText`.
 */
export function plainTextToBlocks(text: string): EmailRichBlock[] {
  return text.split('\n').map((line) => ({
    type: 'paragraph' as const,
    content:
      line.trim().length > 0
        ? [{ type: 'text' as const, text: line.trim(), styles: {} }]
        : [],
  }))
}

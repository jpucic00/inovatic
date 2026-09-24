/**
 * Limits and allowed types for /admin/email attachments — client-safe, so the
 * composer can check a file before uploading it and the server enforces the
 * very same numbers.
 *
 * The limits come from the PARENTS' side, not from Resend's (40 MB per mail):
 * Base64 inflates an attachment by about a third, so 15 MB of files is ~20 MB
 * on the wire — under the ~25 MB a common mailbox accepts, with room for the
 * body. Much above that and a parent's provider refuses the whole message.
 */

export const MAX_ATTACHMENTS = 5
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024

/**
 * A draft (uploaded, never sent) is swept once it is older than this. A day,
 * not an hour: a composer can stay open for a long time, and a draft swept from
 * under it makes the send refuse the whole campaign.
 */
export const DRAFT_ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000

/** MIME type → the label the composer shows next to the file. */
export const ATTACHMENT_TYPES: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'image/jpeg': 'Slika',
  'image/png': 'Slika',
}

/** For the file input's `accept` — extensions too, since some browsers report
 * an empty `type` for Office files picked from certain folders. */
export const ATTACHMENT_ACCEPT = [
  ...Object.keys(ATTACHMENT_TYPES),
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.jpg',
  '.jpeg',
  '.png',
].join(',')

export function isAllowedAttachmentType(mime: string): boolean {
  return Object.hasOwn(ATTACHMENT_TYPES, mime)
}

/** What the composer, the mail and the history all show for one file. */
export type AttachmentSummary = {
  filename: string
  bytes: number
}

/** A file ready to hand to Resend — the summary plus the bytes. */
export type EmailAttachmentFile = AttachmentSummary & {
  contentType: string
  content: Buffer
}

/**
 * Why a set of files may not go out together, or null when it may. One
 * definition for the composer's live check and the server's refusal.
 */
export function attachmentSetError(files: readonly { bytes: number }[]): string | null {
  if (files.length > MAX_ATTACHMENTS) {
    return `Najviše ${MAX_ATTACHMENTS} privitaka po poruci.`
  }
  if (files.some((f) => f.bytes > MAX_ATTACHMENT_BYTES)) {
    return `Pojedini privitak smije imati najviše ${formatMegabytes(MAX_ATTACHMENT_BYTES)}.`
  }
  const total = files.reduce((sum, f) => sum + f.bytes, 0)
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
    return `Privici zajedno smiju imati najviše ${formatMegabytes(MAX_TOTAL_ATTACHMENT_BYTES)}.`
  }
  return null
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}

/**
 * The filename a parent sees. Path segments and control characters go (a
 * browser only ever sends a basename, but the route must not trust that), and
 * the length is capped so a pathological name cannot bloat every mail.
 */
export function cleanAttachmentFilename(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!cleaned) return 'privitak'
  if (cleaned.length <= 150) return cleaned
  const dot = cleaned.lastIndexOf('.')
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : ''
  return cleaned.slice(0, 150 - ext.length) + ext
}

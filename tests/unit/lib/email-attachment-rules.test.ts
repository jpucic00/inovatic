import { describe, expect, it } from 'vitest'
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  attachmentSetError,
  cleanAttachmentFilename,
  isAllowedAttachmentType,
} from '@/lib/email-attachment-rules'

const MB = 1024 * 1024

describe('attachmentSetError', () => {
  it('accepts an empty set and a set at every limit exactly', () => {
    expect(attachmentSetError([])).toBeNull()
    expect(attachmentSetError([{ bytes: MAX_ATTACHMENT_BYTES }])).toBeNull()
    expect(
      attachmentSetError([{ bytes: MAX_ATTACHMENT_BYTES }, { bytes: MAX_TOTAL_ATTACHMENT_BYTES - MAX_ATTACHMENT_BYTES }]),
    ).toBeNull()
    expect(attachmentSetError(Array.from({ length: MAX_ATTACHMENTS }, () => ({ bytes: 1 })))).toBeNull()
  })

  it('refuses too many files, one oversized file, and a total over the cap', () => {
    expect(attachmentSetError(Array.from({ length: MAX_ATTACHMENTS + 1 }, () => ({ bytes: 1 })))).toMatch(
      /Najviše 5 privitaka/,
    )
    expect(attachmentSetError([{ bytes: MAX_ATTACHMENT_BYTES + 1 }])).toMatch(/Pojedini privitak/)
    expect(attachmentSetError([{ bytes: 6 * MB }, { bytes: 6 * MB }, { bytes: 6 * MB }])).toMatch(
      /zajedno/,
    )
  })

  it('keeps the total below what a common mailbox accepts after Base64 (~25 MB)', () => {
    expect((MAX_TOTAL_ATTACHMENT_BYTES * 4) / 3).toBeLessThan(25 * MB)
  })
})

describe('isAllowedAttachmentType', () => {
  it('allows documents and photos, refuses executables, archives and SVG', () => {
    expect(isAllowedAttachmentType('application/pdf')).toBe(true)
    expect(isAllowedAttachmentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true)
    expect(isAllowedAttachmentType('image/png')).toBe(true)
    expect(isAllowedAttachmentType('application/x-msdownload')).toBe(false)
    expect(isAllowedAttachmentType('application/zip')).toBe(false)
    expect(isAllowedAttachmentType('image/svg+xml')).toBe(false)
    expect(isAllowedAttachmentType('')).toBe(false)
    expect(isAllowedAttachmentType('toString')).toBe(false)
  })
})

describe('cleanAttachmentFilename', () => {
  it('keeps a normal Croatian name exactly', () => {
    expect(cleanAttachmentFilename('Ugovor – Šibenik 2026.pdf')).toBe('Ugovor – Šibenik 2026.pdf')
  })

  it('drops path segments and control characters', () => {
    expect(cleanAttachmentFilename('C:\\Users\\x\\ugovor.pdf')).toBe('ugovor.pdf')
    expect(cleanAttachmentFilename('../../etc/ugovor.pdf')).toBe('ugovor.pdf')
    expect(cleanAttachmentFilename('ugo\u0000vor\r\n.pdf')).toBe('ugovor.pdf')
  })

  it('falls back to a name when nothing is left, and caps length keeping the extension', () => {
    expect(cleanAttachmentFilename('   ')).toBe('privitak')
    const long = `${'a'.repeat(300)}.docx`
    const cleaned = cleanAttachmentFilename(long)
    expect(cleaned).toHaveLength(150)
    expect(cleaned.endsWith('.docx')).toBe(true)
  })
})

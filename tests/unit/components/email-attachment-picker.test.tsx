import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * The picker checks the server's attachment limits before uploading. A
 * SCHOOL_CALENDAR campaign adds its own PDF to the same set on the server, so
 * the picker must count that reserved slot too — otherwise the fifth file is
 * accepted here and refused only at preview/send.
 */

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn() } }))
vi.mock('@/actions/admin/email-attachment', () => ({
  deleteDraftEmailAttachment: vi.fn(async () => ({ success: true })),
}))

import { EmailAttachmentPicker, type DraftAttachment } from '@/components/admin/email/email-attachment-picker'

const RESERVED = { note: 'Jedno mjesto zauzima PDF rasporeda školske godine.' }

function drafts(count: number): DraftAttachment[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `att-${i}`,
    filename: `Datoteka ${i}.pdf`,
    bytes: 1024,
    mimeType: 'application/pdf',
  }))
}

function renderPicker(attachments: DraftAttachment[], reservedFile?: { note: string }) {
  render(
    <EmailAttachmentPicker
      attachments={attachments}
      onChange={vi.fn()}
      onUploadingChange={vi.fn()}
      reservedFile={reservedFile}
    />,
  )
}

function pdf(name: string) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' })
}

describe('EmailAttachmentPicker — reserved slot', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    toastErrorMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('with a reserved slot, four files already fill the set', () => {
    renderPicker(drafts(4), RESERVED)
    expect(screen.getByRole('button', { name: /Dodaj privitak/ })).toHaveProperty('disabled', true)
    expect(screen.getByText(/Jedno mjesto zauzima PDF rasporeda/)).toBeTruthy()
  })

  it('without one, four files still leave room for a fifth', () => {
    renderPicker(drafts(4))
    expect(screen.getByRole('button', { name: /Dodaj privitak/ })).toHaveProperty('disabled', false)
    expect(screen.queryByText(/Jedno mjesto zauzima/)).toBeNull()
  })

  it('refuses a pick that would reach the limit only with the reserved file, before uploading', () => {
    renderPicker(drafts(3), RESERVED)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [pdf('a.pdf'), pdf('b.pdf')] } })

    expect(toastErrorMock).toHaveBeenCalledWith('Najviše 5 privitaka po poruci.')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

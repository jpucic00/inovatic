import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import type { StaffLessonModule } from '@/actions/teacher/materials'
import { createMaterial } from '@/actions/material/crud'
import { AddGroupMaterialDialog } from '@/components/teacher/group-lessons/add-group-material-dialog'
import { uploadMaterialFile } from '@/components/material/upload-material-file'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/actions/material/crud', () => ({ createMaterial: vi.fn() }))
vi.mock('@/components/material/upload-material-file', () => ({ uploadMaterialFile: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const modules: StaffLessonModule[] = [
  {
    moduleId: 'm1',
    title: 'Modul 1',
    isActive: true,
    teacherRows: [],
    lessons: [
      {
        id: 'l1',
        title: '1. Vrtuljak',
        description: null,
        sessionNumbers: [1, 2],
        firstDate: null,
        isCurrent: true,
        isNext: false,
        teacherRows: [],
        studentRows: [],
      },
    ],
  },
]

function fillLink() {
  render(<AddGroupMaterialDialog groupId="g1" modules={modules} defaultLessonId="l1" competition={false} />)
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj materijal' }))
  fireEvent.click(screen.getByText('Za polaznike'))
  fireEvent.click(screen.getByText('Poveznica', { exact: true }))
  fireEvent.change(screen.getByLabelText('Adresa'), { target: { value: 'https://example.com/radni-list' } })
  fireEvent.change(screen.getByLabelText('Naslov'), { target: { value: 'Radni list' } })
  fireEvent.click(screen.getByRole('button', { name: 'Spremi' }))
}

describe('AddGroupMaterialDialog — saving', () => {
  beforeEach(() => {
    vi.mocked(createMaterial).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('a save that throws stays a toast and keeps the form, never the error page', async () => {
    vi.mocked(createMaterial).mockRejectedValue(new Error('P1017'))
    fillLink()

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Spremanje nije uspjelo/)))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText('Naslov')).toHaveProperty('value', 'Radni list')
  })

  it('sends a GROUP row into the chosen lesson with the chosen audience', async () => {
    vi.mocked(createMaterial).mockResolvedValue({ success: true } as Awaited<ReturnType<typeof createMaterial>>)
    fillLink()

    await waitFor(() => expect(createMaterial).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createMaterial).mock.calls[0][0]).toMatchObject({
      scope: 'GROUP',
      scheduledGroupId: 'g1',
      lessonId: 'l1',
      audience: 'STUDENT',
      type: 'LINK',
      externalUrl: 'https://example.com/radni-list',
      title: 'Radni list',
      description: null,
    })
  })
})

type UploadResult = Awaited<ReturnType<typeof uploadMaterialFile>>
const UPLOADED: UploadResult = {
  ok: true,
  file: { url: 'https://res.cloudinary.com/x/raw/upload/v1/radni-list.pdf', bytes: 2048, mimeType: 'application/pdf' },
}

/** An upload that reports progress and finishes only when the test says so. */
function controlledUpload() {
  let finish: (r: UploadResult) => void = () => undefined
  let progress: (fraction: number) => void = () => undefined
  vi.mocked(uploadMaterialFile).mockImplementation((_file, _mime, onProgress) => {
    progress = onProgress
    return new Promise<UploadResult>((resolve) => (finish = resolve))
  })
  return {
    progress: (fraction: number) => act(() => progress(fraction)),
    finish: (r: UploadResult) => act(async () => finish(r)),
  }
}

function pickPdf() {
  render(<AddGroupMaterialDialog groupId="g1" modules={modules} defaultLessonId="l1" competition={false} />)
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj materijal' }))
  fireEvent.click(screen.getByText('Za nastavnike'))
  // "Datoteka" labels both the default kind and the file input.
  fireEvent.change(document.querySelector('#group-material-file') as HTMLInputElement, {
    target: { files: [new File(['%PDF'], 'Radni list.pdf', { type: 'application/pdf' })] },
  })
}

describe('AddGroupMaterialDialog — a file is uploaded only on Spremi', () => {
  beforeEach(() => {
    vi.mocked(createMaterial).mockReset()
    vi.mocked(uploadMaterialFile).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('picking a file uploads nothing — cancelling before Spremi sends nothing to Cloudinary', () => {
    pickPdf()

    expect(uploadMaterialFile).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Naslov')).toHaveProperty('value', 'Radni list')
    expect(screen.getByText(/prenosi se kad kliknete Spremi/)).toBeTruthy()
  })

  it('Spremi uploads once with a progress overlay, cannot be closed meanwhile, then saves the uploaded file', async () => {
    vi.mocked(createMaterial).mockResolvedValue({ success: true } as Awaited<ReturnType<typeof createMaterial>>)
    const upload = controlledUpload()
    pickPdf()

    fireEvent.click(screen.getByRole('button', { name: 'Spremi' }))
    await upload.progress(0.42)
    expect(screen.getByRole('status').textContent).toMatch(/Prenosim datoteku… 42 %/)
    expect(createMaterial).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeTruthy()

    await upload.finish(UPLOADED)
    await waitFor(() => expect(createMaterial).toHaveBeenCalledTimes(1))
    expect(uploadMaterialFile).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createMaterial).mock.calls[0][0]).toMatchObject({
      scope: 'GROUP',
      lessonId: 'l1',
      audience: 'TEACHER',
      type: 'DOCUMENT',
      fileUrl: UPLOADED.ok ? UPLOADED.file.url : null,
      fileSize: 2048,
      title: 'Radni list',
    })
  })

  it('a retry after a failed save reuses the upload instead of sending the file again', async () => {
    vi.mocked(createMaterial)
      .mockResolvedValueOnce({ success: false, error: 'Greška.' } as Awaited<ReturnType<typeof createMaterial>>)
      .mockResolvedValueOnce({ success: true } as Awaited<ReturnType<typeof createMaterial>>)
    vi.mocked(uploadMaterialFile).mockResolvedValue(UPLOADED)
    pickPdf()

    fireEvent.click(screen.getByRole('button', { name: 'Spremi' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Greška.'))
    fireEvent.click(screen.getByRole('button', { name: 'Spremi' }))
    await waitFor(() => expect(createMaterial).toHaveBeenCalledTimes(2))

    expect(uploadMaterialFile).toHaveBeenCalledTimes(1)
  })

  // The reuse is keyed on the picked File: a different file after a failed
  // save must be uploaded, never saved under the first file's URL.
  it('a different file picked after a failed save is uploaded and saved, not the first upload', async () => {
    const second: UploadResult = {
      ok: true,
      file: { url: 'https://res.cloudinary.com/x/raw/upload/v1/drugi.pdf', bytes: 4096, mimeType: 'application/pdf' },
    }
    vi.mocked(createMaterial)
      .mockResolvedValueOnce({ success: false, error: 'Greška.' } as Awaited<ReturnType<typeof createMaterial>>)
      .mockResolvedValueOnce({ success: true } as Awaited<ReturnType<typeof createMaterial>>)
    vi.mocked(uploadMaterialFile).mockResolvedValueOnce(UPLOADED).mockResolvedValueOnce(second)
    pickPdf()

    fireEvent.click(screen.getByRole('button', { name: 'Spremi' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Greška.'))
    fireEvent.change(document.querySelector('#group-material-file') as HTMLInputElement, {
      target: { files: [new File(['%PDF'], 'Drugi.pdf', { type: 'application/pdf' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Spremi' }))
    await waitFor(() => expect(createMaterial).toHaveBeenCalledTimes(2))

    expect(uploadMaterialFile).toHaveBeenCalledTimes(2)
    expect(vi.mocked(uploadMaterialFile).mock.calls[1][0].name).toBe('Drugi.pdf')
    expect(vi.mocked(createMaterial).mock.calls[1][0]).toMatchObject({ fileUrl: second.ok ? second.file.url : null })
  })

  it('while uploading, the close button is gone and the form is locked', async () => {
    const upload = controlledUpload()
    pickPdf()

    fireEvent.click(screen.getByRole('button', { name: 'Spremi' }))
    await upload.progress(0.1)
    expect(screen.queryByRole('button', { name: /close|zatvori/i })).toBeNull()
    // The lock is the enclosing <fieldset disabled>, which the input inherits.
    expect(screen.getByLabelText('Naslov').matches(':disabled')).toBe(true)

    await upload.finish({ ok: false, error: 'Datoteka je prevelika.' })
    await waitFor(() => expect(screen.getByLabelText('Naslov').matches(':disabled')).toBe(false))
  })

  it('a failed upload keeps the form and says why, without saving', async () => {
    vi.mocked(uploadMaterialFile).mockResolvedValue({ ok: false, error: 'Datoteka je prevelika.' })
    pickPdf()

    fireEvent.click(screen.getByRole('button', { name: 'Spremi' }))

    await waitFor(() => expect(screen.getByText('Datoteka je prevelika.')).toBeTruthy())
    expect(createMaterial).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByLabelText('Naslov')).toHaveProperty('value', 'Radni list')
  })
})

describe('AddGroupMaterialDialog — which lesson it opens on', () => {
  const open = (defaultLessonId: string | null) => {
    render(
      <AddGroupMaterialDialog groupId="g1" modules={modules} defaultLessonId={defaultLessonId} competition={false} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj materijal' }))
  }

  it('preselects the lesson the group is on', () => {
    open('l1')
    expect(screen.getByLabelText('Lekcija')).toHaveProperty('value', 'l1')
  })

  it('without a current lesson (radionica, natjecanje) it asks, and Spremi waits for the choice', () => {
    open(null)
    expect(screen.getByLabelText('Lekcija')).toHaveProperty('value', '')

    fireEvent.click(screen.getByText('Za polaznike'))
    fireEvent.click(screen.getByText('Poveznica', { exact: true }))
    fireEvent.change(screen.getByLabelText('Adresa'), { target: { value: 'https://example.com/x' } })
    fireEvent.change(screen.getByLabelText('Naslov'), { target: { value: 'Radni list' } })
    expect(screen.getByRole('button', { name: 'Spremi' })).toHaveProperty('disabled', true)

    fireEvent.change(screen.getByLabelText('Lekcija'), { target: { value: 'l1' } })
    expect(screen.getByRole('button', { name: 'Spremi' })).toHaveProperty('disabled', false)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { LessonMaterialSection } from '@/components/material/lesson-material-section'
import { createMaterial } from '@/actions/material/crud'
import { uploadMaterialFile } from '@/components/material/upload-material-file'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/actions/material/crud', () => ({
  createMaterial: vi.fn(),
  updateMaterial: vi.fn(),
  deleteMaterial: vi.fn(),
  setMaterialHidden: vi.fn(),
}))
vi.mock('@/actions/material/move', () => ({
  setMaterialsAudience: vi.fn(),
  moveMaterialToLesson: vi.fn(),
}))
vi.mock('@/actions/admin/material-city', () => ({
  setMaterialCityOnly: vi.fn(),
  makeMaterialShared: vi.fn(),
}))
vi.mock('@/components/material/upload-material-file', () => ({ uploadMaterialFile: vi.fn() }))

type UploadResult = Awaited<ReturnType<typeof uploadMaterialFile>>

/** An upload that finishes only when the test says so. */
function pendingUpload() {
  let finish: (r: UploadResult) => void = () => undefined
  vi.mocked(uploadMaterialFile).mockReturnValue(new Promise<UploadResult>((resolve) => (finish = resolve)))
  return (r: UploadResult) => act(async () => finish(r))
}

const DONE: UploadResult = {
  ok: true,
  file: { url: 'https://res.cloudinary.com/x/raw/upload/v1/popis.pdf', bytes: 10, mimeType: 'application/pdf' },
}

function renderSection() {
  const { container } = render(
    <LessonMaterialSection
      audience="STUDENT"
      heading="Materijali za polaznike"
      rows={[]}
      add={{ mode: 'create', target: { scope: 'LESSON', lessonId: 'l1' } }}
    />,
  )
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File(['%PDF'], 'popis.pdf', { type: 'application/pdf' })] } })
}

describe('LessonMaterialSection — a file removed while it uploads', () => {
  beforeEach(() => {
    vi.mocked(createMaterial).mockReset()
    vi.mocked(createMaterial).mockResolvedValue({ success: true } as Awaited<ReturnType<typeof createMaterial>>)
  })

  it('is never turned into a material once the upload finishes', async () => {
    const finish = pendingUpload()
    renderSection()

    fireEvent.click(await screen.findByRole('button', { name: /Ukloni „popis"/ }))
    await finish(DONE)

    expect(createMaterial).not.toHaveBeenCalled()
    expect(screen.queryByText('popis')).toBeNull()
  })

  it('a file left alone is created as usual', async () => {
    const finish = pendingUpload()
    renderSection()

    await screen.findByRole('button', { name: /Ukloni „popis"/ })
    await finish(DONE)

    expect(createMaterial).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createMaterial).mock.calls[0][0]).toMatchObject({
      scope: 'LESSON',
      lessonId: 'l1',
      audience: 'STUDENT',
      fileUrl: DONE.ok ? DONE.file.url : null,
    })
  })
})

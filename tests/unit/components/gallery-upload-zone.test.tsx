import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { addGalleryImages } from '@/actions/gallery/crud'
import { postFileWithProgress } from '@/components/shared/post-file-with-progress'
import { GalleryUploadZone } from '@/components/gallery/gallery-upload-zone'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/actions/gallery/crud', () => ({ addGalleryImages: vi.fn() }))
vi.mock('@/components/shared/post-file-with-progress', () => ({ postFileWithProgress: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

type SaveResult = Awaited<ReturnType<typeof addGalleryImages>>
type PostResult = Awaited<ReturnType<typeof postFileWithProgress>>

beforeAll(() => {
  // jsdom has no object URLs.
  let n = 0
  URL.createObjectURL = vi.fn(() => `blob:preview-${++n}`)
  URL.revokeObjectURL = vi.fn()
})

const png = (name: string) => new File(['png'], name, { type: 'image/png' })
const uploaded = (name: string): PostResult => ({
  ok: true,
  data: { url: `https://res.cloudinary.com/x/image/upload/v1/${name}`, publicId: `gallery/${name}`, width: 10, height: 10 },
})

function pick(files: File[]) {
  const { container } = render(<GalleryUploadZone scheduledGroupId="g1" moduleId="m1" />)
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files } })
}

describe('GalleryUploadZone — images upload only on "Dodaj u galeriju"', () => {
  beforeEach(() => {
    vi.mocked(postFileWithProgress).mockReset()
    vi.mocked(addGalleryImages).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('picking stages thumbnails and uploads nothing; a wrong type is refused on the spot', () => {
    pick([png('a.png'), png('b.png'), new File(['x'], 'c.heic', { type: 'image/heic' })])

    expect(postFileWithProgress).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Dodaj u galeriju (2)' })).toBeTruthy()
    expect(screen.getByAltText('a.png')).toBeTruthy()
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('c.heic'))
  })

  it('uploads every image once behind the overlay, then saves them together in order', async () => {
    let finishFirst: (r: PostResult) => void = () => undefined
    vi.mocked(postFileWithProgress)
      .mockImplementationOnce((_url, _body, onProgress) => {
        onProgress(0.5)
        return new Promise((resolve) => (finishFirst = resolve))
      })
      .mockResolvedValueOnce(uploaded('b.png'))
    vi.mocked(addGalleryImages).mockResolvedValue({ success: true } as SaveResult)
    pick([png('a.png'), png('b.png')])

    fireEvent.click(screen.getByRole('button', { name: 'Dodaj u galeriju (2)' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Prenosim slike… 1 \/ 2/))
    expect(addGalleryImages).not.toHaveBeenCalled()

    await act(async () => finishFirst(uploaded('a.png')))
    await waitFor(() => expect(addGalleryImages).toHaveBeenCalledTimes(1))
    expect(postFileWithProgress).toHaveBeenCalledTimes(2)
    expect(vi.mocked(addGalleryImages).mock.calls[0][0]).toMatchObject({
      scheduledGroupId: 'g1',
      moduleId: 'm1',
      images: [{ publicId: 'gallery/a.png' }, { publicId: 'gallery/b.png' }],
    })
  })

  it('a failed image blocks the save; the retry re-sends only that one', async () => {
    vi.mocked(postFileWithProgress)
      .mockResolvedValueOnce(uploaded('a.png'))
      .mockResolvedValueOnce({ ok: false, status: 413 })
      .mockResolvedValueOnce(uploaded('b.png'))
    vi.mocked(addGalleryImages).mockResolvedValue({ success: true } as SaveResult)
    pick([png('a.png'), png('b.png')])

    fireEvent.click(screen.getByRole('button', { name: 'Dodaj u galeriju (2)' }))
    await waitFor(() => expect(screen.getByText('Slika je prevelika (najviše 10 MB).')).toBeTruthy())
    expect(addGalleryImages).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Dodaj u galeriju (2)' }))
    await waitFor(() => expect(addGalleryImages).toHaveBeenCalledTimes(1))
    expect(postFileWithProgress).toHaveBeenCalledTimes(3)
  })

  it('a failed save keeps the images, and the retry does not upload them again', async () => {
    vi.mocked(postFileWithProgress).mockResolvedValue(uploaded('a.png'))
    vi.mocked(addGalleryImages)
      .mockRejectedValueOnce(new Error('P1017'))
      .mockResolvedValueOnce({ success: true } as SaveResult)
    pick([png('a.png')])

    fireEvent.click(screen.getByRole('button', { name: 'Dodaj u galeriju (1)' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Spremanje nije uspjelo/)))
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj u galeriju (1)' }))
    await waitFor(() => expect(addGalleryImages).toHaveBeenCalledTimes(2))

    expect(postFileWithProgress).toHaveBeenCalledTimes(1)
  })
})

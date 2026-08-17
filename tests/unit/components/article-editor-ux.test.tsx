/**
 * The two article-editor behaviours the 20-articles.spec.ts 9 → 2 lifecycle
 * merge dropped (Flux yjjvr19), restored at the tier they belong to.
 *
 * Both are pure client behaviour of <ArticleForm>: the tag picker offers every
 * unselected oznaka as a dashed chip and promotes a clicked one to a pill, and
 * the debounced autosave fires on an edit but never on its own. The silence
 * half is the one that matters — an autosave that runs while the admin is only
 * reading writes a snapshot nobody asked for and resets `publishedAt` bookkeeping
 * on every page visit — so it is asserted against a positive control rather
 * than alone, where a mis-wired mock would also look silent.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import type { TagOption } from '@/components/admin/articles/tags-combobox'

const autosaveArticle = vi.fn<(input: unknown) => Promise<{ success: true }>>(
  async () => ({ success: true }),
)

vi.mock('@/actions/admin/article', () => ({
  autosaveArticle: (input: unknown) => autosaveArticle(input),
  publishArticle: vi.fn(async () => ({ success: true })),
  unpublishArticle: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/actions/admin/article-gallery', () => ({
  addGalleryImages: vi.fn(async () => ({ success: true })),
  removeGalleryImage: vi.fn(async () => ({ success: true })),
  reorderGalleryImage: vi.fn(async () => ({ success: true })),
}))
// BlockNote needs a real editor host (and ships its own CSS); the form only
// needs it to render and stay quiet, so stub the dynamic import target.
vi.mock('@/components/admin/articles/blocknote-editor', () => ({
  BlockNoteEditor: () => <div data-testid="blocknote-stub" />,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { ArticleForm } = await import('@/components/admin/articles/article-form')

const AVAILABLE_TAGS: TagOption[] = [
  { id: 't1', name: 'Natjecanja', slug: 'natjecanja', count: 7 },
  { id: 't2', name: 'Radionice', slug: 'radionice', count: 3 },
]

function renderForm() {
  return render(
    <ArticleForm
      initial={{
        id: 'article-1',
        slug: 'prvi-clanak',
        title: 'Prvi članak',
        excerpt: null,
        coverImage: null,
        content: [],
        isPublished: false,
        publishedAt: null,
        city: 'SPLIT',
        tags: [],
        images: [],
      }}
      availableTags={AVAILABLE_TAGS}
    />,
  )
}

/** Push past the 1s autosave debounce — the E2E case this replaces idled ~6s. */
async function idle(ms = 6000) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  autosaveArticle.mockClear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ArticleForm — tag picker', () => {
  it('offers every unselected oznaka as a chip and promotes a clicked one to a pill', async () => {
    renderForm()

    // Chips are the add buttons; the pill carries the Ukloni button instead.
    expect(screen.getByRole('button', { name: 'Natjecanja' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Radionice' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ukloni Natjecanja' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Natjecanja' }))

    expect(screen.getByRole('button', { name: 'Ukloni Natjecanja' })).toBeInTheDocument()
    // Promoted, not duplicated: the chip leaves the grid so it cannot be added twice.
    expect(screen.queryByRole('button', { name: 'Natjecanja' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Radionice' })).toBeInTheDocument()

    // Selecting an oznaka IS an edit, so it must reach the autosave — the same
    // debounce the idle case below proves stays unarmed.
    await idle()
    expect(autosaveArticle).toHaveBeenCalledTimes(1)
    expect(autosaveArticle).toHaveBeenCalledWith(
      expect.objectContaining({ tagNames: ['Natjecanja'] }),
    )
  })

  it('removes a pill again and returns it to the chip grid', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Radionice' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ukloni Radionice' }))

    expect(screen.getByRole('button', { name: 'Radionice' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ukloni Radionice' })).not.toBeInTheDocument()
  })
})

describe('ArticleForm — autosave', () => {
  it('stays silent while the form sits untouched', async () => {
    renderForm()

    await idle()

    expect(autosaveArticle).not.toHaveBeenCalled()
    expect(screen.queryByText(/Spremam/)).not.toBeInTheDocument()
  })

  it('fires once after an edit settles (positive control for the silence above)', async () => {
    renderForm()

    fireEvent.change(screen.getByLabelText('Naslov *'), {
      target: { value: 'Prvi članak — dopuna' },
    })
    await idle(999) // still inside the debounce
    expect(autosaveArticle).not.toHaveBeenCalled()

    await idle(1)
    expect(autosaveArticle).toHaveBeenCalledTimes(1)
    expect(autosaveArticle).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Prvi članak — dopuna' }),
    )

    // And goes quiet again once the snapshot matches what was saved.
    await idle()
    expect(autosaveArticle).toHaveBeenCalledTimes(1)
  })
})

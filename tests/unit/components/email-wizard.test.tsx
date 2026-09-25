import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'

/**
 * Client-side payload contracts of the e-mail wizard — the halves the
 * integration suite cannot see:
 *  - "Odaberi sve grupe" must submit every REAL group id (the audit snapshot
 *    depends on ids arriving, not a select-all flag);
 *  - EVALUATION exclusion is keyed on the report card (`rowKey` = assessment
 *    id): unchecking one sibling must put exactly that id in
 *    `excludedAssessmentIds` and never touch the shared parent address.
 */

const {
  getEmailGroupTreeMock,
  previewEmailHtmlMock,
  previewEmailRecipientsMock,
  sendEmailCampaignMock,
  getCampaignProgressMock,
} = vi.hoisted(() => ({
  getEmailGroupTreeMock: vi.fn(),
  previewEmailHtmlMock: vi.fn(),
  previewEmailRecipientsMock: vi.fn(),
  sendEmailCampaignMock: vi.fn(),
  getCampaignProgressMock: vi.fn(),
}))

vi.mock('@/actions/admin/email-campaign', () => ({
  getCampaignProgress: getCampaignProgressMock,
  getEmailGroupTree: getEmailGroupTreeMock,
  previewEmailHtml: previewEmailHtmlMock,
  previewEmailRecipients: previewEmailRecipientsMock,
  previewEvaluationEmailForRecipient: vi.fn(),
  sendEmailCampaign: sendEmailCampaignMock,
}))
vi.mock('@/actions/admin/inquiry', () => ({ getGroupsForCourse: vi.fn() }))
const { deleteDraftEmailAttachmentMock } = vi.hoisted(() => ({
  deleteDraftEmailAttachmentMock: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/actions/admin/email-attachment', () => ({
  deleteDraftEmailAttachment: deleteDraftEmailAttachmentMock,
}))
/**
 * The body editor is BlockNote behind a `next/dynamic` boundary — a
 * contenteditable surface that jsdom cannot drive and that this suite is not
 * testing. Stood in by a textarea speaking the same contract (plain text in,
 * blocks out) so the payload assertions below stay about payloads.
 */
vi.mock('@/components/admin/email/email-body-editor', () => ({
  EmailBodyEditor: ({ onChange }: { onChange: (b: unknown[]) => void }) => (
    <textarea
      aria-label="Tekst poruke"
      onChange={(e) => onChange(plainTextToBlocks(e.target.value))}
    />
  ),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { EmailWizard } from '@/components/admin/email/email-wizard'
import { plainTextToBlocks } from '@/lib/email-rich-text'

type WizardProps = ComponentProps<typeof EmailWizard>

function treeGroup(id: string) {
  return {
    id,
    name: `Grupa ${id}`,
    dayOfWeek: 'Utorak',
    dateStart: null,
    dateEnd: null,
    startTime: '17:00',
    endTime: '18:30',
    location: { name: 'Velebitska 32' },
    _count: { enrollments: 5 },
    gradedCount: 5,
  }
}

// Structural stand-in for the Prisma payload — the component only reads the
// fields above.
const TREE = [
  { id: 'c1', title: 'SLR 1', kind: 'STANDARD', scheduledGroups: [treeGroup('g1'), treeGroup('g2')] },
  { id: 'c2', title: 'SLR 2', kind: 'STANDARD', scheduledGroups: [treeGroup('g3')] },
] as unknown as WizardProps['initialTree']

const BASE_PROPS: WizardProps = {
  years: ['2025/2026', '2024/2025'],
  selectedYear: '2025/2026',
  previousYear: '2024/2025',
  targetCourses: [],
  initialTree: TREE,
  recommendationOptions: [],
}

function recipient(rowKey: string, parentEmail: string, childName: string) {
  return {
    rowKey,
    parentEmail,
    assessmentIds: rowKey.startsWith('assess-') ? [rowKey] : [],
    children: [{ name: childName, groupLabel: 'Grupa g1', complete: true }],
  }
}

async function fillContentAndGoToStep2(kindLabel?: string) {
  if (kindLabel) {
    fireEvent.click(screen.getByRole('button', { name: kindLabel }))
  }
  fireEvent.change(screen.getByLabelText(/Predmet/), {
    target: { value: 'Testni predmet' },
  })
  // By role, not by label text: the editor sits in a fieldset whose legend is
  // "Tekst poruke", so a bare label query matches the group as well as the field.
  fireEvent.change(await screen.findByRole('textbox', { name: /Tekst poruke/ }), {
    target: { value: 'Dovoljno dugačak tekst poruke za formu.' },
  })
  fireEvent.click(screen.getByRole('button', { name: /Dalje: primatelji/ }))
  // Step 2 is on-screen once the select-all checkbox shows.
  await screen.findByText('Odaberi sve grupe')
}

beforeEach(() => {
  vi.clearAllMocks()
  getEmailGroupTreeMock.mockResolvedValue(TREE)
  getCampaignProgressMock.mockResolvedValue({
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalCount: 0,
    finishedAt: new Date(),
    finished: true,
  })
  sendEmailCampaignMock.mockResolvedValue({
    success: true,
    campaignId: 'camp-1',
    total: 1,
    alreadySent: 0,
    excluded: 0,
    skipped: [],
  })
  previewEmailHtmlMock.mockResolvedValue({ success: true, html: '<p>pregled</p>' })
})

describe('EmailWizard — the formatted body travels with the plain text', () => {
  const TEXT = 'Dovoljno dugačak tekst poruke za formu.'

  it('previews the blocks alongside the flattened text', async () => {
    render(<EmailWizard {...BASE_PROPS} />)

    fireEvent.change(screen.getByLabelText(/Predmet/), { target: { value: 'Testni predmet' } })
    fireEvent.change(await screen.findByRole('textbox', { name: /Tekst poruke/ }), {
      target: { value: TEXT },
    })
    fireEvent.click(screen.getByRole('button', { name: /Pregled e-maila/ }))
    await waitFor(() =>
      expect(previewEmailHtmlMock).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'CUSTOM', bodyText: TEXT, bodyBlocks: plainTextToBlocks(TEXT) }),
      ),
    )
  })

  it('sends the blocks alongside the flattened text', async () => {
    previewEmailRecipientsMock.mockResolvedValue({
      success: true,
      recipients: [recipient('mama@test.hr', 'mama@test.hr', 'Ana Anić')],
      skipped: [],
      alreadySent: [],
    })
    render(<EmailWizard {...BASE_PROPS} />)

    fireEvent.change(screen.getByLabelText(/Predmet/), { target: { value: 'Testni predmet' } })
    fireEvent.change(await screen.findByRole('textbox', { name: /Tekst poruke/ }), {
      target: { value: TEXT },
    })
    fireEvent.click(screen.getByRole('button', { name: /Dalje: primatelji/ }))
    await screen.findByText('Odaberi sve grupe')
    fireEvent.click(screen.getByRole('checkbox', { name: /Odaberi sve grupe/ }))
    await screen.findByText(/Ana Anić/)
    fireEvent.click(screen.getByRole('button', { name: /Pošalji \(1\)/ }))
    fireEvent.click(screen.getByRole('button', { name: /Potvrdi slanje \(1\)/ }))

    await waitFor(() => expect(sendEmailCampaignMock).toHaveBeenCalledTimes(1))
    // Dropping `bodyBlocks` from the send input would mail every campaign
    // unformatted while the preview still showed the formatting.
    expect(sendEmailCampaignMock.mock.calls[0][0]).toMatchObject({
      bodyText: TEXT,
      bodyBlocks: plainTextToBlocks(TEXT),
    })
  })

  it('turns the counter red and holds the wizard on step 1 past the limit', async () => {
    render(<EmailWizard {...BASE_PROPS} />)
    fireEvent.change(screen.getByLabelText(/Predmet/), { target: { value: 'Testni predmet' } })
    const tooLong = 'x'.repeat(5001)
    fireEvent.change(await screen.findByRole('textbox', { name: /Tekst poruke/ }), {
      target: { value: tooLong },
    })

    const counter = screen.getByText('5001/5000')
    expect(counter.className).toContain('text-red-600')
    // The textarea this editor replaced hard-stopped at 5000; the gate has to
    // do that job now, or the limit is only discovered on send.
    fireEvent.click(screen.getByRole('button', { name: /Dalje: primatelji/ }))
    expect(screen.queryByText('Odaberi sve grupe')).toBeNull()
  })
})

describe('EmailWizard — client payload contracts', () => {
  it('"Odaberi sve grupe" submits every real group id, and they reach the send payload', async () => {
    previewEmailRecipientsMock.mockResolvedValue({
      success: true,
      recipients: [recipient('mama@test.hr', 'mama@test.hr', 'Ana Anić')],
      skipped: [],
      alreadySent: [],
    })

    render(<EmailWizard {...BASE_PROPS} />)
    await fillContentAndGoToStep2()

    fireEvent.click(screen.getByRole('checkbox', { name: /Odaberi sve grupe/ }))

    // The live recipient resolution must carry the REAL ids of all three groups.
    await waitFor(() => {
      expect(previewEmailRecipientsMock).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'CUSTOM', sourceGroupIds: ['g1', 'g2', 'g3'] }),
      )
    })
    await screen.findByText(/Ana Anić/)

    fireEvent.click(screen.getByRole('button', { name: /Pošalji \(1\)/ }))
    fireEvent.click(screen.getByRole('button', { name: /Potvrdi slanje \(1\)/ }))

    await waitFor(() => expect(sendEmailCampaignMock).toHaveBeenCalledTimes(1))
    const input = sendEmailCampaignMock.mock.calls[0][0]
    expect(input.kind).toBe('CUSTOM')
    expect(input.sourceGroupIds).toEqual(['g1', 'g2', 'g3'])
    expect(input.excludedParentEmails).toEqual([])
    expect(input.excludedAssessmentIds).toBeUndefined()
  })

  it('EVALUATION: unchecking one sibling excludes exactly that card, never the shared address', async () => {
    previewEmailRecipientsMock.mockResolvedValue({
      success: true,
      recipients: [
        recipient('assess-ana', 'mama@test.hr', 'Ana Anić'),
        recipient('assess-ivo', 'mama@test.hr', 'Ivo Anić'),
      ],
      skipped: [],
      alreadySent: [],
    })

    render(<EmailWizard {...BASE_PROPS} />)
    await fillContentAndGoToStep2('Evaluacija (izvještaj)')

    fireEvent.click(screen.getByRole('checkbox', { name: /Odaberi sve grupe/ }))
    await screen.findByText(/Ana Anić/)

    // Two siblings share one inbox — two rows, same accessible label.
    const rows = screen.getAllByRole('checkbox', { name: 'Primatelj mama@test.hr' })
    expect(rows).toHaveLength(2)
    fireEvent.click(rows[0]) // uncheck Ana's card

    fireEvent.click(screen.getByRole('button', { name: /Pošalji \(1\)/ }))
    fireEvent.click(screen.getByRole('button', { name: /Potvrdi slanje \(1\)/ }))

    await waitFor(() => expect(sendEmailCampaignMock).toHaveBeenCalledTimes(1))
    const input = sendEmailCampaignMock.mock.calls[0][0]
    expect(input.kind).toBe('EVALUATION')
    expect(input.excludedAssessmentIds).toEqual(['assess-ana'])
    // The sibling's mail must survive: no address-level exclusion may exist.
    expect(input.excludedParentEmails).toBeUndefined()
  })
})

describe('EmailWizard — attachments travel as draft ids', () => {
  const TEXT = 'Dovoljno dugačak tekst poruke za formu.'
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  function pickFiles(files: File[]) {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files } })
  }

  function uploadResponds(id: string, filename: string) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id, filename, bytes: 2048, mimeType: 'application/pdf' }),
    })
  }

  async function writeMessage() {
    fireEvent.change(screen.getByLabelText(/Predmet/), { target: { value: 'Testni predmet' } })
    fireEvent.change(await screen.findByRole('textbox', { name: /Tekst poruke/ }), {
      target: { value: TEXT },
    })
  }

  it('uploads a picked file and sends its id with the campaign', async () => {
    previewEmailRecipientsMock.mockResolvedValue({
      success: true,
      recipients: [recipient('mama@test.hr', 'mama@test.hr', 'Ana Anić')],
      skipped: [],
      alreadySent: [],
    })
    uploadResponds('att-1', 'Ugovor.pdf')
    render(<EmailWizard {...BASE_PROPS} />)
    await writeMessage()

    pickFiles([new File(['%PDF-1.4'], 'Ugovor.pdf', { type: 'application/pdf' })])
    await screen.findByText('Ugovor.pdf')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/upload/email-attachment',
      expect.objectContaining({ method: 'POST' }),
    )

    fireEvent.click(screen.getByRole('button', { name: /Dalje: primatelji/ }))
    await screen.findByText('Odaberi sve grupe')
    fireEvent.click(screen.getByRole('checkbox', { name: /Odaberi sve grupe/ }))
    await screen.findByText(/Ana Anić/)
    // Named again before the send, so nobody mails a contract by surprise.
    expect(screen.getByText(/idu svakom primatelju/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Pošalji \(1\)/ }))
    fireEvent.click(screen.getByRole('button', { name: /Potvrdi slanje \(1\)/ }))

    await waitFor(() => expect(sendEmailCampaignMock).toHaveBeenCalledTimes(1))
    expect(sendEmailCampaignMock.mock.calls[0][0]).toMatchObject({ attachmentIds: ['att-1'] })
  })

  it('previews with the uploaded ids, so the mail shows its Prilozi list', async () => {
    uploadResponds('att-3', 'Ugovor.pdf')
    render(<EmailWizard {...BASE_PROPS} />)
    await writeMessage()
    pickFiles([new File(['%PDF-1.4'], 'Ugovor.pdf', { type: 'application/pdf' })])
    await screen.findByText('Ugovor.pdf')

    fireEvent.click(screen.getByRole('button', { name: /Pregled e-maila/ }))
    await waitFor(() =>
      expect(previewEmailHtmlMock).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentIds: ['att-3'] }),
      ),
    )
  })

  it('removing a file deletes the draft and drops it from the preview', async () => {
    uploadResponds('att-2', 'Cjenik.pdf')
    render(<EmailWizard {...BASE_PROPS} />)
    await writeMessage()
    pickFiles([new File(['%PDF-1.4'], 'Cjenik.pdf', { type: 'application/pdf' })])
    await screen.findByText('Cjenik.pdf')

    fireEvent.click(screen.getByRole('button', { name: /Ukloni privitak Cjenik.pdf/ }))
    expect(deleteDraftEmailAttachmentMock).toHaveBeenCalledWith('att-2')
    expect(screen.queryByText('Cjenik.pdf')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Pregled e-maila/ }))
    await waitFor(() =>
      expect(previewEmailHtmlMock).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentIds: [] }),
      ),
    )
  })

  it('refuses an oversized file before uploading it', async () => {
    render(<EmailWizard {...BASE_PROPS} />)
    await writeMessage()
    const big = new File(['x'], 'veliki.pdf', { type: 'application/pdf' })
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 })
    pickFiles([big])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText('veliki.pdf')).toBeNull()
  })

  it('SCHOOL_CALENDAR reserves one slot for the generated PDF; other kinds do not', () => {
    render(<EmailWizard {...BASE_PROPS} />)
    expect(screen.queryByText(/Jedno mjesto zauzima PDF rasporeda/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Raspored školske godine/ }))
    expect(screen.getByText(/Jedno mjesto zauzima PDF rasporeda/)).toBeTruthy()
  })
})

describe('EmailWizard — SCHOOL_CALENDAR subject follows the PDF year', () => {
  async function pickCalendarAndGoToStep2() {
    fireEvent.click(screen.getByRole('button', { name: /Raspored školske godine/ }))
    expect(screen.getByLabelText(/Predmet/)).toHaveValue(
      'Raspored radionica za školsku godinu 2025./2026.',
    )
    fireEvent.click(screen.getByRole('button', { name: /Dalje: primatelji/ }))
    await screen.findByText('Odaberi sve grupe')
  }

  async function sendToAllGroups() {
    previewEmailRecipientsMock.mockResolvedValue({
      success: true,
      recipients: [recipient('mama@test.hr', 'mama@test.hr', 'Ana Anić')],
      skipped: [],
      alreadySent: [],
    })
    // A year change reloads the group tree, so the checkbox comes back async.
    fireEvent.click(await screen.findByRole('checkbox', { name: /Odaberi sve grupe/ }))
    await screen.findByText(/Ana Anić/)
    fireEvent.click(screen.getByRole('button', { name: /Pošalji \(1\)/ }))
    fireEvent.click(screen.getByRole('button', { name: /Potvrdi slanje \(1\)/ }))
    await waitFor(() => expect(sendEmailCampaignMock).toHaveBeenCalledTimes(1))
    return sendEmailCampaignMock.mock.calls[0][0]
  }

  it('changing the year in step 2 renames the prefilled subject to the year the PDF is for', async () => {
    render(<EmailWizard {...BASE_PROPS} />)
    await pickCalendarAndGoToStep2()

    fireEvent.change(screen.getByLabelText('Školska godina'), { target: { value: '2024/2025' } })
    const input = await sendToAllGroups()

    expect(input.kind).toBe('SCHOOL_CALENDAR')
    expect(input.sourceSchoolYear).toBe('2024/2025')
    expect(input.subject).toBe('Raspored radionica za školsku godinu 2024./2025.')
  })

  it('leaves a subject the admin wrote alone', async () => {
    render(<EmailWizard {...BASE_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: /Raspored školske godine/ }))
    fireEvent.change(screen.getByLabelText(/Predmet/), { target: { value: 'Naš raspored' } })
    fireEvent.click(screen.getByRole('button', { name: /Dalje: primatelji/ }))
    await screen.findByText('Odaberi sve grupe')

    fireEvent.change(screen.getByLabelText('Školska godina'), { target: { value: '2024/2025' } })
    const input = await sendToAllGroups()

    expect(input.subject).toBe('Naš raspored')
  })
})

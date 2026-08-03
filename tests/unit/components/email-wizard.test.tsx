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
  previewEmailRecipientsMock,
  sendEmailCampaignMock,
  getCampaignProgressMock,
} = vi.hoisted(() => ({
  getEmailGroupTreeMock: vi.fn(),
  previewEmailRecipientsMock: vi.fn(),
  sendEmailCampaignMock: vi.fn(),
  getCampaignProgressMock: vi.fn(),
}))

vi.mock('@/actions/admin/email-campaign', () => ({
  getCampaignProgress: getCampaignProgressMock,
  getEmailGroupTree: getEmailGroupTreeMock,
  previewEmailHtml: vi.fn(),
  previewEmailRecipients: previewEmailRecipientsMock,
  previewEvaluationEmailForRecipient: vi.fn(),
  sendEmailCampaign: sendEmailCampaignMock,
}))
vi.mock('@/actions/admin/inquiry', () => ({ getGroupsForCourse: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { EmailWizard } from '@/components/admin/email/email-wizard'

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
  fireEvent.change(screen.getByLabelText(/Tekst poruke/), {
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

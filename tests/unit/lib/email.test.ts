import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Resend SDK so no network call is made and we can assert the exact
// payload each sender hands to `resend.emails.send`.
const { send } = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  },
}))

import {
  sendBulkMessageEmail,
  sendInquiryConfirmationEmail,
  sendScheduleOptionsEmail,
  sendTeacherCredentialsEmail,
} from '@/lib/email'

const inquiryArgs = {
  to: 'roditelj@example.hr',
  parentName: 'Ana Anić',
  childName: 'Marko Anić',
  childDateOfBirth: '15.06.2016.',
}

describe('email senders', () => {
  beforeEach(() => {
    send.mockReset()
    send.mockResolvedValue({ data: { id: 'sent' }, error: null })
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('no-ops (no network send, returns false) when RESEND_API_KEY is unset', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const sent = await sendInquiryConfirmationEmail(inquiryArgs)
    expect(sent).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('sends with the exact subject, recipient, sender and reply-to when the key is set', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test_key')
    const sent = await sendInquiryConfirmationEmail(inquiryArgs)
    expect(sent).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toMatchObject({
      to: 'roditelj@example.hr',
      from: 'Inovatic <noreply@udruga-inovatic.hr>',
      replyTo: 'prijave@udruga-inovatic.hr',
      subject: 'Zaprimili smo vašu prijavu – Inovatic',
    })
  })

  it('interpolates the child name into the schedule-options subject', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test_key')
    await sendScheduleOptionsEmail({
      to: 'roditelj@example.hr',
      parentName: 'Ana Anić',
      childName: 'Marko Anić',
      options: [
        {
          groupName: 'SLR 2',
          schedule: 'Utorak, 17:00–18:30',
          locationName: 'OŠ Meje',
          locationAddress: 'Prilaz braće Kaliterna 10, 21000 Split',
        },
      ],
    })
    expect(send.mock.calls[0][0].subject).toBe('Dostupni termini za Marko Anić – Inovatic')
  })

  it('maps the teacher variant to its subject (new vs reset)', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test_key')
    const base = { to: 'ivana@example.hr', firstName: 'Ivana', lastName: 'Kovač', password: 'x' }
    await sendTeacherCredentialsEmail({ ...base, variant: 'new' })
    await sendTeacherCredentialsEmail({ ...base, variant: 'reset' })
    expect(send.mock.calls[0][0].subject).toBe('Pristupni podaci – Inovatic')
    expect(send.mock.calls[1][0].subject).toBe('Nova lozinka – Inovatic')
  })

  it('passes the admin-authored bulk-message subject through verbatim', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test_key')
    await sendBulkMessageEmail({
      to: 'roditelj@example.hr',
      subject: 'Upisi u školsku godinu 2026/2027 – Inovatic',
      bodyText: 'Pozivamo vas na upis.',
    })
    expect(send.mock.calls[0][0]).toMatchObject({
      to: 'roditelj@example.hr',
      subject: 'Upisi u školsku godinu 2026/2027 – Inovatic',
      replyTo: 'prijave@udruga-inovatic.hr',
    })
  })

  it('bulk-message no-ops without a key like every other sender', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const sent = await sendBulkMessageEmail({
      to: 'roditelj@example.hr',
      subject: 'Obavijest – Inovatic',
      bodyText: 'Kratka obavijest.',
    })
    expect(sent).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('surfaces a Resend in-band error (e.g. unverified domain) as a throw', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test_key')
    send.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'The udruga-inovatic.hr domain is not verified.' },
    })
    await expect(sendInquiryConfirmationEmail(inquiryArgs)).rejects.toThrow(/not verified/)
  })
})

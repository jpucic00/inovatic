import { describe, expect, it } from 'vitest'
import { SERVICE_VALUES, stemEducationInquirySchema } from '@/lib/validators/stem-education'

const valid = {
  contactName: 'Ivana Ivić',
  institutionName: 'OŠ Meje',
  email: 'ivana.ivic@skole.hr',
  phone: '091 234 5678',
  institutionType: 'OSNOVNA_SKOLA',
  services: ['OSNOVNA_EDUKACIJA'],
  trainingPlace: 'USTANOVA_NARUCITELJA',
  message: 'Trebamo edukaciju za tri učiteljice na LEGO SPIKE setovima.',
  consent: true,
} as const

describe('stemEducationInquirySchema', () => {
  it('accepts a fully populated submission', () => {
    expect(stemEducationInquirySchema.safeParse(valid).success).toBe(true)
  })

  it('accepts an omitted phone and the empty training-place placeholder', () => {
    const parsed = stemEducationInquirySchema.safeParse({
      ...valid,
      phone: '',
      trainingPlace: '',
    })
    expect(parsed.success).toBe(true)
  })

  it('requires at least one service', () => {
    const parsed = stemEducationInquirySchema.safeParse({ ...valid, services: [] })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0].message).toBe('Odaberite barem jednu uslugu')
  })

  it('rejects an unknown service key', () => {
    expect(
      stemEducationInquirySchema.safeParse({ ...valid, services: ['LETENJE_NA_MJESEC'] }).success,
    ).toBe(false)
  })

  it('rejects the unselected institution-type placeholder with a Croatian message', () => {
    const parsed = stemEducationInquirySchema.safeParse({ ...valid, institutionType: '' })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0].message).toBe('Odaberite vrstu ustanove')
  })

  it('rejects an invalid email', () => {
    expect(stemEducationInquirySchema.safeParse({ ...valid, email: 'ivana.ivic' }).success).toBe(false)
  })

  it('rejects a too-short description', () => {
    expect(stemEducationInquirySchema.safeParse({ ...valid, message: 'Trebamo' }).success).toBe(false)
  })

  it('requires the privacy consent', () => {
    const parsed = stemEducationInquirySchema.safeParse({ ...valid, consent: false })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0].message).toBe('Morate pristati na obradu osobnih podataka.')
  })

  it('trims whitespace around free-text fields', () => {
    const parsed = stemEducationInquirySchema.parse({
      ...valid,
      contactName: '  Ivana Ivić  ',
      institutionName: '  OŠ Meje ',
    })
    expect(parsed.contactName).toBe('Ivana Ivić')
    expect(parsed.institutionName).toBe('OŠ Meje')
  })

  // Only 7 service values exist, but the array was unbounded: a crafted payload
  // (well within Next's 1 MB action-body limit) reached the email body as a
  // giant join, and gave the confirmation template duplicate React keys.
  it('rejects more services than there are values to choose from', () => {
    const parsed = stemEducationInquirySchema.safeParse({
      ...valid,
      services: Array(5000).fill('OSNOVNA_EDUKACIJA'),
    })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0].message).toBe('Neispravan odabir usluga.')
  })

  it('de-duplicates a repeated service', () => {
    const parsed = stemEducationInquirySchema.parse({
      ...valid,
      services: ['OSNOVNA_EDUKACIJA', 'OSNOVNA_EDUKACIJA', 'SAVJETOVANJE'],
    })
    expect(parsed.services).toEqual(['OSNOVNA_EDUKACIJA', 'SAVJETOVANJE'])
  })

  it('accepts one of every service — the cap is the enum length, not a guess', () => {
    const parsed = stemEducationInquirySchema.safeParse({
      ...valid,
      services: [...SERVICE_VALUES],
    })
    expect(parsed.success).toBe(true)
  })

  it('caps contactName and email, which had no limit while their siblings did', () => {
    const longName = stemEducationInquirySchema.safeParse({
      ...valid,
      contactName: 'a'.repeat(121),
    })
    expect(longName.success).toBe(false)

    const longEmail = stemEducationInquirySchema.safeParse({
      ...valid,
      email: `${'a'.repeat(250)}@test.hr`,
    })
    expect(longEmail.success).toBe(false)
  })
})

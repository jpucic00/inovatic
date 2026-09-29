import { describe, expect, it } from 'vitest'
import { landingFor, type PortalChoices } from '@/lib/portal-landing'

const child = (id: string) => ({ id, firstName: id, lastName: 'Anić' })
const choices = (panels: PortalChoices['panels'], kids: number): PortalChoices => ({
  panels,
  children: Array.from({ length: kids }, (_, i) => child(`c${i}`)),
})

describe('landingFor', () => {
  it('opens the portal directly for a parent with one child', () => {
    expect(landingFor('PARENT', choices([], 1))).toBe('/portal')
  })

  it('sends a parent of siblings to the picker', () => {
    expect(landingFor('PARENT', choices([], 2))).toBe('/portal/odabir')
  })

  it('sends a plain admin to /admin and a plain teacher to /nastavnik', () => {
    expect(landingFor('ADMIN', choices(['admin'], 0))).toBe('/admin')
    expect(landingFor('TEACHER', choices(['teacher'], 0))).toBe('/nastavnik')
  })

  it('offers a dual-role admin the picker', () => {
    expect(landingFor('ADMIN', choices(['admin', 'teacher'], 0))).toBe('/portal/odabir')
  })

  it('offers a teacher whose own child attends the picker, never a silent default', () => {
    expect(landingFor('TEACHER', choices(['teacher'], 1))).toBe('/portal/odabir')
  })

  it('lands the classroom login on the portal whatever else is true', () => {
    expect(landingFor('CLASSROOM', choices([], 0))).toBe('/portal')
  })
})

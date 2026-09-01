import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PortalGroupTabs } from '@/components/portal/portal-group-tabs'

const usePathname = vi.fn()
vi.mock('next/navigation', () => ({ usePathname: () => usePathname() }))

const GROUP = 'g-1'
const BASE = `/portal/grupa/${GROUP}`

beforeEach(() => {
  usePathname.mockReturnValue(BASE)
})

describe('PortalGroupTabs', () => {
  it('renders all three panels for a gradable group', () => {
    render(<PortalGroupTabs groupId={GROUP} gradable />)

    expect(screen.getByRole('link', { name: 'Materijali' }).getAttribute('href')).toBe(BASE)
    expect(screen.getByRole('link', { name: 'Galerija' }).getAttribute('href')).toBe(
      `${BASE}/galerija`,
    )
    expect(screen.getByRole('link', { name: 'Evaluacija' }).getAttribute('href')).toBe(
      `${BASE}/evaluacija`,
    )
  })

  // Radionice are never graded, so that panel does not exist for them — the
  // strip must not offer a tab whose page can only explain itself away.
  it('omits Evaluacija when the group is not gradable', () => {
    render(<PortalGroupTabs groupId={GROUP} gradable={false} />)

    expect(screen.getByRole('link', { name: 'Materijali' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Galerija' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Evaluacija' })).toBeNull()
  })

  it('marks the tab matching the pathname as current', () => {
    usePathname.mockReturnValue(`${BASE}/galerija`)
    render(<PortalGroupTabs groupId={GROUP} gradable />)

    expect(
      screen.getByRole('link', { name: 'Galerija' }).getAttribute('aria-current'),
    ).toBe('page')
    expect(
      screen.getByRole('link', { name: 'Materijali' }).getAttribute('aria-current'),
    ).toBeNull()
  })

  it('falls back to Materijali as the current tab on the base route', () => {
    render(<PortalGroupTabs groupId={GROUP} gradable />)

    expect(
      screen.getByRole('link', { name: 'Materijali' }).getAttribute('aria-current'),
    ).toBe('page')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AdminDesktopSidebar } from '@/components/admin/admin-mobile-nav'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))
vi.mock('next/link', () => ({
  default: ({ children, href }: Readonly<{ children: ReactNode; href: string }>) => (
    <a href={href}>{children}</a>
  ),
}))
// Stub the school-year switcher — it pulls in useRouter + server actions we
// don't exercise here. The badge lives on the nav link, not the switcher.
vi.mock('@/components/admin/school-year-switcher', () => ({
  SchoolYearSwitcher: () => null,
}))
vi.mock('@/actions/logout', () => ({ logoutAction: vi.fn() }))

const baseProps = {
  userName: 'Admin',
  cityLabel: 'Split',
  years: ['2025/2026'],
  selectedYear: '2025/2026',
  currentYear: '2025/2026',
  showTeacherPanel: false,
}

const WARNING_LABEL = 'Školska godina nije isplanirana'

describe('AdminDesktopSidebar — "plan the year" badge', () => {
  it('shows the warning marker beside the Kalendar link when the year needs planning', () => {
    render(<AdminDesktopSidebar {...baseProps} calendarNeedsPlanning />)

    const marker = screen.getByLabelText(WARNING_LABEL)
    expect(marker).toBeTruthy()
    // The marker is a sibling of the Kalendar link inside the same row, not a
    // child of the <a> (keeps the HTML valid + gives it its own click target).
    const kalendarLink = screen.getByRole('link', { name: /Kalendar/ })
    expect(kalendarLink.contains(marker)).toBe(false)
    expect(kalendarLink.parentElement?.contains(marker)).toBe(true)
  })

  it('reveals the hint on click and hides it again on a second click', () => {
    render(<AdminDesktopSidebar {...baseProps} calendarNeedsPlanning />)
    const marker = screen.getByLabelText(WARNING_LABEL)

    // Closed by default — the popover content is not mounted.
    expect(screen.queryByText(/isplanirajte module/i)).toBeNull()
    expect(marker.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(marker)
    expect(screen.getByText(/isplanirajte module/i)).toBeTruthy()
    expect(marker.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(marker)
    expect(screen.queryByText(/isplanirajte module/i)).toBeNull()
    expect(marker.getAttribute('aria-expanded')).toBe('false')
  })

  it('renders no warning marker when the year is fully planned', () => {
    render(<AdminDesktopSidebar {...baseProps} calendarNeedsPlanning={false} />)

    expect(screen.queryByLabelText(WARNING_LABEL)).toBeNull()
    expect(screen.queryByText(/isplanirajte module/i)).toBeNull()
  })
})

describe('AdminDesktopSidebar — city chip placement', () => {
  it('renders the city chip in the top header next to the logo, not in the footer', () => {
    render(<AdminDesktopSidebar {...baseProps} calendarNeedsPlanning={false} />)

    const chip = screen.getByText('Split')
    // Top-left header: the chip shares its parent with the logo link.
    expect(chip.parentElement?.querySelector('a[href="/admin"]')).toBeTruthy()
    // Not down in the footer beside the logout control.
    const footer = screen.getByRole('button', { name: /Odjava/ }).closest('div')
    expect(footer?.contains(chip)).toBe(false)
  })
})

describe('AdminDesktopSidebar — "Nastavnički panel" shortcut', () => {
  it('links to /nastavnik when the admin also teaches', () => {
    render(<AdminDesktopSidebar {...baseProps} calendarNeedsPlanning={false} showTeacherPanel />)

    const link = screen.getByRole('link', { name: /Nastavnički panel/ })
    expect(link.getAttribute('href')).toBe('/nastavnik')
  })

  it('is hidden for a Split-only admin who does not teach', () => {
    render(
      <AdminDesktopSidebar
        {...baseProps}
        calendarNeedsPlanning={false}
        showTeacherPanel={false}
      />,
    )

    expect(screen.queryByRole('link', { name: /Nastavnički panel/ })).toBeNull()
  })
})

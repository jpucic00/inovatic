import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  years: ['2025/2026'],
  selectedYear: '2025/2026',
  currentYear: '2025/2026',
}

const WARNING_LABEL = 'Školska godina nije isplanirana'

describe('AdminDesktopSidebar — "plan the year" badge', () => {
  it('shows the warning icon on the Kalendar link when the year needs planning', () => {
    render(<AdminDesktopSidebar {...baseProps} calendarNeedsPlanning />)

    const marker = screen.getByLabelText(WARNING_LABEL)
    expect(marker).toBeTruthy()
    // The marker sits inside the Kalendar link, not any other nav item.
    const kalendarLink = screen.getByRole('link', { name: /Kalendar/ })
    expect(kalendarLink.contains(marker)).toBe(true)
  })

  it('renders no warning icon when the year is fully planned', () => {
    render(<AdminDesktopSidebar {...baseProps} calendarNeedsPlanning={false} />)

    expect(screen.queryByLabelText(WARNING_LABEL)).toBeNull()
  })
})

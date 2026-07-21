import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LoginForm } from '@/components/auth/login-form'
import { loginAction } from '@/actions/login'

const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))
vi.mock('@/actions/login', () => ({ loginAction: vi.fn() }))

const mockedLogin = vi.mocked(loginAction)

async function submitLogin() {
  fireEvent.change(screen.getByLabelText('Korisničko ime ili e-mail'), {
    target: { value: 'admin@test.local' },
  })
  fireEvent.change(screen.getByLabelText('Lozinka'), { target: { value: 'lozinka123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Prijavi se' }))
}

describe('LoginForm — dual-role panel choice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the panel choice instead of redirecting for a dual-role admin', async () => {
    mockedLogin.mockResolvedValue({ success: true, role: 'ADMIN', showTeacherPanel: true })
    render(<LoginForm />)

    await submitLogin()

    const adminButton = await screen.findByRole('button', { name: 'Administracija' })
    expect(screen.getByRole('button', { name: 'Nastavnički panel' })).toBeTruthy()
    expect(pushMock).not.toHaveBeenCalled()

    fireEvent.click(adminButton)
    expect(pushMock).toHaveBeenCalledWith('/admin')
    expect(refreshMock).toHaveBeenCalled()
  })

  it('routes to /nastavnik when the teacher panel is picked', async () => {
    mockedLogin.mockResolvedValue({ success: true, role: 'ADMIN', showTeacherPanel: true })
    render(<LoginForm />)

    await submitLogin()

    fireEvent.click(await screen.findByRole('button', { name: 'Nastavnički panel' }))
    expect(pushMock).toHaveBeenCalledWith('/nastavnik')
  })

  it('redirects a plain admin straight to /admin with no choice step', async () => {
    mockedLogin.mockResolvedValue({ success: true, role: 'ADMIN', showTeacherPanel: false })
    render(<LoginForm />)

    await submitLogin()

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/admin'))
    expect(screen.queryByRole('button', { name: 'Administracija' })).toBeNull()
  })

  it('redirects a teacher straight to /nastavnik', async () => {
    mockedLogin.mockResolvedValue({ success: true, role: 'TEACHER', showTeacherPanel: false })
    render(<LoginForm />)

    await submitLogin()

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/nastavnik'))
  })
})

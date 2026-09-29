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
  fireEvent.change(screen.getByLabelText('E-mail'), {
    target: { value: 'roditelj@test.local' },
  })
  fireEvent.change(screen.getByLabelText('Lozinka'), { target: { value: 'lozinka123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Prijavi se' }))
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // The action owns the routing (panel, portal, or the /portal/odabir picker);
  // the form must follow it verbatim rather than re-deriving it from a role.
  it.each(['/admin', '/nastavnik', '/portal', '/portal/odabir'])(
    'goes wherever the action says: %s',
    async (destination) => {
      mockedLogin.mockResolvedValue({ success: true, destination })
      render(<LoginForm />)

      await submitLogin()

      await waitFor(() => expect(pushMock).toHaveBeenCalledWith(destination))
      expect(refreshMock).toHaveBeenCalled()
    },
  )

  it('shows the action error and stays put', async () => {
    mockedLogin.mockResolvedValue({ success: false, error: 'Pogrešan e-mail ili lozinka.' })
    render(<LoginForm />)

    await submitLogin()

    expect(await screen.findByText('Pogrešan e-mail ili lozinka.')).toBeTruthy()
    expect(pushMock).not.toHaveBeenCalled()
  })
})

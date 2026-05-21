import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { DateInput } from '@/components/ui/date-input'

function TestHarness({ initial = '' }: Readonly<{ initial?: string }>) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <DateInput value={value} onChange={setValue} id="d" />
      <span data-testid="iso">{value}</span>
    </>
  )
}

const textInput = (container: HTMLElement) =>
  container.querySelector('input[type="text"]') as HTMLInputElement

describe('DateInput — auto-dot insertion', () => {
  it('typing 15052026 progressively yields 15.05.2026 and emits ISO 2026-05-15', async () => {
    const user = userEvent.setup()
    const { container, getByTestId } = render(<TestHarness />)
    const input = textInput(container)
    await user.click(input)
    await user.type(input, '15052026')
    expect(input.value).toBe('15.05.2026')
    expect(getByTestId('iso').textContent).toBe('2026-05-15')
  })

  it('inserts the first dot when entering the third digit', async () => {
    const user = userEvent.setup()
    const { container } = render(<TestHarness />)
    const input = textInput(container)
    await user.click(input)
    await user.type(input, '150')
    expect(input.value).toBe('15.0')
  })

  it('inserts the second dot when entering the sixth digit (after .)', async () => {
    const user = userEvent.setup()
    const { container } = render(<TestHarness />)
    const input = textInput(container)
    await user.click(input)
    await user.type(input, '15050')
    expect(input.value).toBe('15.05.0')
  })
})

describe('DateInput — paste handling', () => {
  it('ISO paste 2026-05-15 normalises to 15.05.2026 and emits same ISO', () => {
    const onChange = vi.fn()
    const { container } = render(<DateInput value="" onChange={onChange} id="d" />)
    const input = textInput(container)
    fireEvent.paste(input, {
      clipboardData: { getData: () => '2026-05-15' },
    })
    expect(input.value).toBe('15.05.2026')
    expect(onChange).toHaveBeenCalledWith('2026-05-15')
  })

  it('Croatian dd.MM.yyyy paste round-trips (pasted as 8 digits)', () => {
    const onChange = vi.fn()
    const { container } = render(<DateInput value="" onChange={onChange} id="d" />)
    const input = textInput(container)
    fireEvent.paste(input, {
      clipboardData: { getData: () => '15.05.2026' },
    })
    expect(input.value).toBe('15.05.2026')
    expect(onChange).toHaveBeenCalledWith('2026-05-15')
  })

  it('8-digit bare paste (15052026) formats and emits ISO', () => {
    const onChange = vi.fn()
    const { container } = render(<DateInput value="" onChange={onChange} id="d" />)
    const input = textInput(container)
    fireEvent.paste(input, {
      clipboardData: { getData: () => '15052026' },
    })
    expect(input.value).toBe('15.05.2026')
    expect(onChange).toHaveBeenCalledWith('2026-05-15')
  })
})

describe('DateInput — validation on blur', () => {
  it('invalid date 32.13.2026 cleared on blur (no ISO emitted, display restored)', async () => {
    const user = userEvent.setup()
    const { container, getByTestId } = render(<TestHarness />)
    const input = textInput(container)
    await user.click(input)
    await user.type(input, '32132026')
    fireEvent.blur(input)
    // value never set to ISO (invalid day & month); display reverts to empty
    expect(getByTestId('iso').textContent).toBe('')
    expect(input.value).toBe('')
  })

  it('valid initial ISO renders as dd.MM.yyyy', () => {
    const { container } = render(
      <DateInput value="2026-05-15" onChange={vi.fn()} id="d" />,
    )
    expect(textInput(container).value).toBe('15.05.2026')
  })
})

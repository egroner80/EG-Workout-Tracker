import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Stepper } from './Stepper'

afterEach(() => {
  vi.useRealTimers()
})

describe('Stepper', () => {
  it('steps once per tap and respects limits', async () => {
    const user = userEvent.setup()
    const onIncrement = vi.fn()
    const onDecrement = vi.fn()
    render(
      <Stepper label="reps" value={0} onIncrement={onIncrement} onDecrement={onDecrement} canDecrement={false} />,
    )
    await user.click(screen.getByRole('button', { name: 'Increase reps' }))
    expect(onIncrement).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Decrease reps' })).toBeDisabled()
    expect(onDecrement).not.toHaveBeenCalled()
  })

  it('repeats while held and does not add an extra step on release', () => {
    vi.useFakeTimers()
    const onIncrement = vi.fn()
    render(<Stepper label="weight" value="18 kg" onIncrement={onIncrement} onDecrement={() => {}} />)
    const plus = screen.getByRole('button', { name: 'Increase weight' })
    fireEvent.pointerDown(plus)
    vi.advanceTimersByTime(420 + 110 * 3)
    fireEvent.pointerUp(plus)
    fireEvent.click(plus)
    expect(onIncrement).toHaveBeenCalledTimes(4)
  })

  it('stops repeating when a held button reaches its limit', () => {
    vi.useFakeTimers()
    const onIncrement = vi.fn()
    const { rerender } = render(<Stepper label="sets" value={7} onIncrement={onIncrement} onDecrement={() => {}} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Increase sets' }))
    vi.advanceTimersByTime(420)
    expect(onIncrement).toHaveBeenCalledTimes(1)
    // The limit disables the button; a disabled button never receives pointerup.
    rerender(<Stepper label="sets" value={8} onIncrement={onIncrement} onDecrement={() => {}} canIncrement={false} />)
    vi.advanceTimersByTime(110 * 10)
    expect(onIncrement).toHaveBeenCalledTimes(1)
  })
})

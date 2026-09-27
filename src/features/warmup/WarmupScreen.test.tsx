import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateMeta } from '../../data/repositories/settingsRepo'
import { useWorkoutStore } from '../../state/workoutStore'
import { advance, advanceFrames, renderAt, resetApp, startWorkout } from '../../test/workoutHarness'
import { WorkoutRoute } from '../workout/WorkoutRoute'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  await resetApp()
  await updateMeta({ soundCheckDone: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('guided warm-up', () => {
  it('shows the first step huge with START, and counts down after the get-ready', async () => {
    const user = userEvent.setup()
    await startWorkout()
    renderAt(<WorkoutRoute />)

    expect(screen.getByRole('heading', { name: 'Jump rope' })).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('2:00')
    expect(screen.getByText('1 of 5')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByLabelText('Starting in 3')).toBeInTheDocument()

    advance(3_100)
    expect(screen.getByRole('timer')).toHaveTextContent('2:00')
    advance(30_000)
    expect(screen.getByRole('timer')).toHaveTextContent('1:30')

    await user.click(screen.getByRole('button', { name: 'Pause' }))
    advance(10_000)
    expect(screen.getByRole('timer')).toHaveTextContent('1:30')
    expect(screen.getByText('Paused')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Resume' }))
    advance(5_000)
    expect(screen.getByRole('timer')).toHaveTextContent('1:25')
  })

  it('moves to the next step at zero and auto-starts it after the get-ready', async () => {
    const user = userEvent.setup()
    await startWorkout()
    renderAt(<WorkoutRoute />)
    await user.click(screen.getByRole('button', { name: 'Start' }))
    // Frame-by-frame so the completion is "fresh" and chains.
    advanceFrames(123_500)
    expect(screen.getByRole('heading', { name: 'Shoulder CARs' })).toBeInTheDocument()
    expect(screen.getByText('2 of 5')).toBeInTheDocument()
    advance(3_000)
    expect(screen.getByRole('timer')).toHaveTextContent('0:45')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('waits for START when the get-ready setting is off', async () => {
    const user = userEvent.setup()
    await startWorkout()
    useWorkoutStore.setState((state) => ({ settings: { ...state.settings, getReadyCountdown: false } }))
    renderAt(<WorkoutRoute />)
    await user.click(screen.getByRole('button', { name: 'Start' }))
    advanceFrames(120_500)
    expect(screen.getByRole('heading', { name: 'Shoulder CARs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('Skip marks the step skipped; Previous returns to it', async () => {
    const user = userEvent.setup()
    await startWorkout()
    renderAt(<WorkoutRoute />)
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByRole('heading', { name: 'Shoulder CARs' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByRole('heading', { name: 'Jump rope' })).toBeInTheDocument()
    expect(screen.getByText('Skipped')).toBeInTheDocument()
  })

  it('ends with "Warm-up complete" and START STRENGTH WORKOUT opens Pull-ups', async () => {
    const user = userEvent.setup()
    await startWorkout()
    renderAt(<WorkoutRoute />)
    for (let i = 0; i < 5; i++) await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByRole('heading', { name: 'Warm-up complete' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start strength workout' }))
    expect(screen.getByRole('heading', { name: 'Pull-ups' })).toBeInTheDocument()
  })
})

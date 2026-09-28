import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateMeta } from '../../data/repositories/settingsRepo'
import { useWorkoutStore } from '../../state/workoutStore'
import { act, advance, advanceFrames, renderAt, resetApp, startWorkout } from '../../test/workoutHarness'
import { WorkoutRoute } from '../workout/WorkoutRoute'

/** Puts the guided warm-up on a step, with nothing running. */
function goToStep(stepId: string) {
  act((s) => {
    const index = s.warmup.findIndex((step) => step.stepId === stepId)
    return { session: { ...s, runtime: { ...s.runtime!, warmup: { index, timer: null, getReady: null } } }, events: [] }
  })
}

const stepLog = (stepId: string) => useWorkoutStore.getState().session?.warmup.find((step) => step.stepId === stepId)

/** How full the step's progress bar is; the bar is decorative, so it has no role to query. */
function barFill(container: HTMLElement): number {
  const fill = container.querySelector<HTMLElement>('[style*="scaleX"]')
  return Number(/scaleX\((.+)\)/.exec(fill?.style.transform ?? '')?.[1])
}

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
    expect(screen.getByText('1 of 10')).toBeInTheDocument()

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
    expect(screen.getByRole('heading', { name: 'Deep squat' })).toBeInTheDocument()
    expect(screen.getByText('2 of 10')).toBeInTheDocument()
    advance(3_000)
    expect(screen.getByRole('timer')).toHaveTextContent('0:30')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('waits for START when the get-ready setting is off', async () => {
    const user = userEvent.setup()
    await startWorkout()
    useWorkoutStore.setState((state) => ({ settings: { ...state.settings, getReadyCountdown: false } }))
    renderAt(<WorkoutRoute />)
    await user.click(screen.getByRole('button', { name: 'Start' }))
    advanceFrames(120_500)
    expect(screen.getByRole('heading', { name: 'Deep squat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('Skip marks the step skipped; Previous returns to it', async () => {
    const user = userEvent.setup()
    await startWorkout()
    renderAt(<WorkoutRoute />)
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByRole('heading', { name: 'Deep squat' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByRole('heading', { name: 'Jump rope' })).toBeInTheDocument()
    expect(screen.getByText('Skipped')).toBeInTheDocument()
  })

  it('ends with "Warm-up complete" and START STRENGTH WORKOUT opens Pull-ups', async () => {
    const user = userEvent.setup()
    await startWorkout()
    renderAt(<WorkoutRoute />)
    for (let i = 0; i < 10; i++) await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByRole('heading', { name: 'Warm-up complete' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start strength workout' }))
    expect(screen.getByRole('heading', { name: 'Pull-ups' })).toBeInTheDocument()
  })

  it('runs the squat-routine holds back to back, then waits for Done on the slow squats', async () => {
    const user = userEvent.setup()
    await startWorkout()
    goToStep('deep-squat-hold')
    renderAt(<WorkoutRoute />)
    await user.click(screen.getByRole('button', { name: 'Start' }))
    advanceFrames(33_000)
    // The next hold is already counting down: no get-ready in between.
    expect(screen.getByRole('heading', { name: 'Deep squat · knee push-outs' })).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('0:30')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    advanceFrames(90_000)
    expect(screen.getByRole('heading', { name: 'Slow bodyweight squats' })).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('heading', { name: 'Shoulder CARs' })).toBeInTheDocument()
    expect(screen.getByLabelText('Starting in 3')).toBeInTheDocument()
  })
})

describe('rep-counted and per-side warm-up steps', () => {
  it('shows a rep step as a count with Done instead of a timer, and Done shows the next step', async () => {
    const user = userEvent.setup()
    await startWorkout('lower')
    goToStep('hip-hinges')
    renderAt(<WorkoutRoute />)

    expect(screen.getByRole('heading', { name: 'Bodyweight hip hinges' })).toBeInTheDocument()
    expect(screen.getByText('11 of 13')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('reps')).toBeInTheDocument()
    expect(screen.getByText('Push the hips back, flat back')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(stepLog('hip-hinges')).toMatchObject({ completed: true, skipped: false })
    expect(screen.getByRole('heading', { name: 'Bodyweight Bulgarian split squat' })).toBeInTheDocument()
    expect(screen.getByText('12 of 13')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('each side')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('offers Next on a rep step already done, and Done again on a skipped one', async () => {
    const user = userEvent.setup()
    await startWorkout('lower')
    goToStep('hip-hinges')
    renderAt(<WorkoutRoute />)
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: 'Previous' }))

    expect(screen.getByRole('heading', { name: 'Bodyweight hip hinges' })).toBeInTheDocument()
    expect(screen.getByText('Done ✓')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
    // The big button and the one in the Previous · Skip · Next row both move on.
    const [primary] = screen.getAllByRole('button', { name: 'Next' })
    await user.click(primary)
    expect(screen.getByRole('heading', { name: 'Bodyweight Bulgarian split squat' })).toBeInTheDocument()
    expect(stepLog('hip-hinges')).toMatchObject({ completed: true })

    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByText('Skipped')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(stepLog('bw-split-squats')).toMatchObject({ completed: true, skipped: false })
    expect(screen.getByRole('heading', { name: 'Glute bridges' })).toBeInTheDocument()
  })

  it('counts in the timed step that follows a rep step', async () => {
    const user = userEvent.setup()
    await startWorkout('lower')
    goToStep('slow-squats')
    renderAt(<WorkoutRoute />)
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('heading', { name: 'Ankle rocks' })).toBeInTheDocument()
    expect(screen.getByLabelText('Starting in 3')).toBeInTheDocument()
    advance(3_000)
    expect(screen.getByRole('timer')).toHaveTextContent('0:45')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('counts down one side at a time and names it, while the bar tracks the whole step', async () => {
    const user = userEvent.setup()
    await startWorkout('lower')
    goToStep('worlds-greatest-stretch')
    const { container } = renderAt(<WorkoutRoute />)
    expect(screen.getByRole('timer')).toHaveTextContent('0:30')
    expect(screen.getByText('Left side')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByLabelText('Starting in 3')).toBeInTheDocument()
    expect(screen.getByText('Left side')).toBeInTheDocument()
    advance(3_000)
    advance(10_000)
    expect(screen.getByText('Left side')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('0:20')
    expect(barFill(container)).toBeCloseTo(10 / 60)

    advance(30_000)
    expect(screen.getByText('Right side')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('0:20')
    expect(barFill(container)).toBeCloseTo(40 / 60)

    // Both sides done: the next step is counted, so nothing counts in.
    advanceFrames(20_250)
    expect(screen.getByRole('heading', { name: 'Bodyweight hip hinges' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Starting in/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByRole('heading', { name: 'World’s greatest stretch' })).toBeInTheDocument()
    expect(screen.getByText('each side')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('0:30')
    expect(screen.getByText('Done ✓')).toBeInTheDocument()
    expect(barFill(container)).toBe(1)
  })

  it('keeps the side of a paused or half-done per-side step', async () => {
    const user = userEvent.setup()
    await startWorkout('lower')
    useWorkoutStore.setState((state) => ({ settings: { ...state.settings, getReadyCountdown: false } }))
    goToStep('worlds-greatest-stretch')
    renderAt(<WorkoutRoute />)
    await user.click(screen.getByRole('button', { name: 'Start' }))
    advance(12_000)
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByText('Left side')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('0:18')

    await user.click(screen.getByRole('button', { name: 'Resume' }))
    advance(28_000)
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByText('Right side')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('0:20')

    // Leave it half done, then come back to it.
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByRole('heading', { name: 'World’s greatest stretch' })).toBeInTheDocument()
    expect(screen.getByText('Right side')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('0:20')
    await user.click(screen.getByRole('button', { name: 'Resume' }))
    advance(5_000)
    expect(screen.getByText('Right side')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('0:15')
  })

  it('lists each step as reps, per side, or time on the warm-up-complete screen', async () => {
    const user = userEvent.setup()
    await startWorkout('lower')
    goToStep('glute-bridges')
    renderAt(<WorkoutRoute />)
    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.getByRole('heading', { name: 'Warm-up complete' })).toBeInTheDocument()
    const row = (name: string) => screen.getByText(name).closest('li')
    expect(row('Glute bridges')).toHaveTextContent('10 reps · Done')
    expect(row('Bodyweight hip hinges')).toHaveTextContent('10 reps · Not done')
    expect(row('Bodyweight Bulgarian split squat')).toHaveTextContent('6 each side · Not done')
    expect(row('World’s greatest stretch')).toHaveTextContent('30 s each side · Not done')
    expect(row('Ankle rocks')).toHaveTextContent('0:45 · Not done')
  })
})

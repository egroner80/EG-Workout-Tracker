import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateMeta } from '../../data/repositories/settingsRepo'
import type { PendingResolution } from '../../domain/session'
import type { Prescription } from '../../domain/types'
import { startStrength, stepExerciseLoad, stepReps } from '../../domain/workout/actions'
import { createOverride } from '../../services/dataCommands'
import { useWorkoutStore } from '../../state/workoutStore'
import { act, renderAt, resetApp, startWorkout } from '../../test/workoutHarness'
import { SummaryScreen } from './SummaryScreen'

const MINUTE = 60_000

/** Runs a workout through the store: the callback records actuals, the rest is done as prescribed. */
async function finishWorkout(record: () => void = () => {}, minutes = 41): Promise<string> {
  const session = await startWorkout()
  act(startStrength)
  record()
  vi.setSystemTime(Date.now() + minutes * MINUTE)
  const resolutions: Record<string, PendingResolution> = Object.fromEntries(
    session.exercises.map((e) => [e.exerciseId, 'done' as const]),
  )
  return useWorkoutStore.getState().finish(resolutions)
}

function renderSummary(id: string) {
  return renderAt(<SummaryScreen />, `/summary/${id}`, '/summary/:sessionId')
}

const block = (name: string) => screen.getByRole('region', { name })

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  await resetApp()
  await updateMeta({ soundCheckDone: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('completion screen', () => {
  it('shows duration, target vs actual with ✅ only when met, and next targets', async () => {
    const id = await finishWorkout(() => {
      act((s, ctx) => stepReps(s, 'dips', 2, -1, ctx))
      act((s, ctx) => stepExerciseLoad(s, 'db-row', -1, ctx))
    })
    renderSummary(id)

    expect(await screen.findByText('Duration: 41 min')).toBeInTheDocument()

    const pullUps = block('Pull-ups')
    expect(pullUps).toHaveTextContent('TargetBW · 5 / 5 / 5')
    expect(within(pullUps).getByLabelText('target met')).toBeInTheDocument()
    expect(pullUps).toHaveTextContent('Next5 / 5 / 6')

    const dips = block('Dips')
    expect(dips).toHaveTextContent('ActualBW · 5 / 5 / 4')
    expect(within(dips).queryByLabelText('target met')).not.toBeInTheDocument()
    expect(dips).toHaveTextContent('NextRepeat 5 / 5 / 5')

    const row = block('One-arm DB row')
    expect(row).toHaveTextContent('Actual16 kg · 5 / 5 / 5')
    expect(row).toHaveTextContent('NextRepeat 18 kg · 5 / 5 / 5')

    expect(block('Suitcase carry')).toHaveTextContent('Next18 kg · 45 s per side × 2')
    expect(block('Warm-up')).toHaveTextContent('Repeat 2:00')

    const next = (await screen.findByRole('heading', { name: 'Next workout' })).closest('section')!
    expect(next).toHaveTextContent('Pull-upsBW · 5 / 5 / 6')
    expect(next).toHaveTextContent('DB Row18 kg · 5 / 5 / 5')
  })

  it('lets the user choose the next resistance at the bodyweight top rung', async () => {
    const user = userEvent.setup()
    const top: Prescription = { kind: 'reps', loadKg: 0, reps: [6, 6, 6] }
    await createOverride('pull-ups', top, Date.now())
    vi.setSystemTime(Date.now() + MINUTE)
    const id = await finishWorkout()
    renderSummary(id)

    const pullUps = await screen.findByRole('region', { name: 'Pull-ups' })
    expect(within(pullUps).getByText('Top of ladder — choose next resistance')).toBeInTheDocument()
    const stepper = within(pullUps).getByRole('group', { name: 'next resistance' })
    expect(stepper).toHaveTextContent('BW + 2.5 kg')

    vi.setSystemTime(Date.now() + MINUTE)
    await user.click(within(pullUps).getByRole('button', { name: 'Increase next resistance' }))
    await vi.waitFor(() => expect(stepper).toHaveTextContent('BW + 5 kg'))
    const next = (await screen.findByRole('heading', { name: 'Next workout' })).closest('section')!
    await vi.waitFor(() => expect(next).toHaveTextContent('Pull-upsBW + 5 kg · 5 / 5 / 5'))

    vi.setSystemTime(Date.now() + MINUTE)
    await user.click(within(pullUps).getByRole('button', { name: 'Stay at BW' }))
    await vi.waitFor(() => expect(next).toHaveTextContent('Pull-upsBW · 6 / 6 / 6'))
  })

  it('edits a next target from the list without touching the stored recommendation', async () => {
    const user = userEvent.setup()
    const id = await finishWorkout()
    renderSummary(id)
    const next = (await screen.findByRole('heading', { name: 'Next workout' })).closest('section')!
    vi.setSystemTime(Date.now() + MINUTE)
    await user.click(within(next).getByText('DB Press'))
    await user.click(screen.getByRole('radio', { name: '5 / 6 / 6' }))
    await user.click(screen.getByRole('button', { name: 'Save target' }))
    await vi.waitFor(() => expect(next).toHaveTextContent('DB Press12 kg · 5 / 6 / 6'))
    expect(block('Standing DB press')).toHaveTextContent('Next12 kg · 5 / 5 / 6')
  })

  it('reopens the workout with Edit workout and keeps the original duration after finishing again', async () => {
    const user = userEvent.setup()
    const id = await finishWorkout()
    renderSummary(id)
    await user.click(await screen.findByRole('button', { name: 'Edit workout' }))
    await vi.waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/workout'))
    expect(useWorkoutStore.getState().session).toMatchObject({ id, status: 'active' })

    vi.setSystemTime(Date.now() + 30 * MINUTE)
    await useWorkoutStore.getState().finish({})
    renderSummary(id)
    expect((await screen.findAllByText('Duration: 41 min')).length).toBeGreaterThan(0)
  })

  it('reminds to back up after five workouts without a backup', async () => {
    await updateMeta({ workoutsSinceBackup: 4 })
    const id = await finishWorkout()
    renderSummary(id)
    expect(await screen.findByRole('button', { name: 'Back up now' })).toBeInTheDocument()
  })
})

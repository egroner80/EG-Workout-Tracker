import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateMeta } from '../../data/repositories/settingsRepo'
import type { PendingResolution } from '../../domain/session'
import type { Prescription, TemplateId } from '../../domain/types'
import { startStrength, startWarmupStep, stepExerciseLoad, stepReps } from '../../domain/workout/actions'
import { createOverride } from '../../services/dataCommands'
import { getCurrentPrescriptions } from '../../services/queries'
import { useWorkoutStore } from '../../state/workoutStore'
import { act, advance, renderAt, resetApp, startWorkout } from '../../test/workoutHarness'
import { SummaryScreen } from './SummaryScreen'

const MINUTE = 60_000

interface WorkoutRun {
  type?: TemplateId
  /** Runs while the warm-up is current, before the strength block. */
  warmup?: () => void
  minutes?: number
}

/** Runs a workout through the store: the callback records actuals, the rest is done as prescribed. */
async function finishWorkout(
  record: () => void = () => {},
  { type = 'upper', warmup = () => {}, minutes = 41 }: WorkoutRun = {},
): Promise<string> {
  const session = await startWorkout(type)
  warmup()
  act(startStrength)
  record()
  vi.setSystemTime(Date.now() + minutes * MINUTE)
  const resolutions: Record<string, PendingResolution> = Object.fromEntries(
    session.exercises.map((e) => [e.exerciseId, 'done' as const]),
  )
  return useWorkoutStore.getState().finish(resolutions)
}

/** Jump rope runs its full 2:00 after the get-ready. */
function jumpRope() {
  act(startWarmupStep)
  advance(3_000 + 120_000)
}

function renderSummary(id: string) {
  return renderAt(<SummaryScreen />, `/summary/${id}`, '/summary/:sessionId')
}

const block = (name: string) => screen.getByRole('region', { name })

async function nextSection(workout: string) {
  return (await screen.findByRole('heading', { name: `Next workout · ${workout}` })).closest('section')!
}

const nextTarget = async (templateId: TemplateId, targetId: string) =>
  (await getCurrentPrescriptions(templateId)).get(targetId)?.prescription

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  await resetApp()
  await updateMeta({ soundCheckDone: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('completion screen', () => {
  it('shows duration, target vs actual with ✅ only when met, and the lower-body targets next', async () => {
    const id = await finishWorkout(() => {
      act((s, ctx) => stepReps(s, 'dips', 2, -1, ctx))
      act((s, ctx) => stepExerciseLoad(s, 'db-row', -1, ctx))
    })
    renderSummary(id)

    expect(await screen.findByText('Duration: 41 min')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Upper body workout complete' })).toBeInTheDocument()

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

    const carry = block('Suitcase carry')
    expect(carry).toHaveTextContent('Next18 kg · 45 s per side × 2')
    expect(within(carry).getByText('Carry')).toBeInTheDocument()
    expect(block('Warm-up')).toHaveTextContent('Repeat 2:00')

    // Upper and lower alternate, so the lower workout comes next; the rope is shared.
    const next = await nextSection('Lower body')
    expect(next).toHaveTextContent('Jump rope2:00')
    expect(next).toHaveTextContent('Split squat12 kg · 5 / 5 / 5')
    expect(next).toHaveTextContent('CopenhagenBW · 20 s per side × 2')
    expect(within(next).queryByText('Pull-ups')).not.toBeInTheDocument()
  })

  it('names a lower workout and lists the upper-body targets next, with the jump rope it just earned', async () => {
    const id = await finishWorkout(() => {}, { type: 'lower', warmup: jumpRope })
    renderSummary(id)

    expect(await screen.findByRole('heading', { level: 1, name: 'Lower body workout complete' })).toBeInTheDocument()
    expect(block('Warm-up')).toHaveTextContent('Jump rope 2:00 ✅Next: 2:10')
    expect(block('Bulgarian split squat')).toHaveTextContent('Next12 kg · 5 / 5 / 6')
    const plank = block('Copenhagen plank')
    expect(plank).toHaveTextContent('NextBW · 25 s per side × 2')
    expect(within(plank).queryByText('Static hold')).not.toBeInTheDocument()

    const next = await nextSection('Upper body')
    expect(next).toHaveTextContent('Jump rope2:10')
    expect(next).toHaveTextContent('Pull-upsBW · 5 / 5 / 5')
    expect(within(next).queryByText('Double unders')).not.toBeInTheDocument()
    expect(within(next).queryByText('Split squat')).not.toBeInTheDocument()
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
    expect(await nextTarget('upper', 'pull-ups')).toEqual({ kind: 'reps', loadKg: 5, reps: [5, 5, 5] })

    vi.setSystemTime(Date.now() + MINUTE)
    await user.click(within(pullUps).getByRole('button', { name: 'Stay at bodyweight' }))
    await vi.waitFor(() => expect(within(stepper).getByText('BW')).toBeInTheDocument())
    expect(await nextTarget('upper', 'pull-ups')).toEqual({ kind: 'reps', loadKg: 0, reps: [6, 6, 6] })

    // Any load other than the one just finished starts its ladder at the bottom rung.
    vi.setSystemTime(Date.now() + MINUTE)
    await user.click(within(pullUps).getByRole('button', { name: 'Increase next resistance' }))
    await vi.waitFor(() => expect(stepper).toHaveTextContent('BW + 2.5 kg'))
    expect(await nextTarget('upper', 'pull-ups')).toEqual({ kind: 'reps', loadKg: 2.5, reps: [5, 5, 5] })
  })

  it('shows the load chosen for a lower-body lift at its top rung right away', async () => {
    const user = userEvent.setup()
    await createOverride('sliding-hamstring-curl', { kind: 'reps', loadKg: 0, reps: [10, 10] }, Date.now())
    vi.setSystemTime(Date.now() + MINUTE)
    const id = await finishWorkout(() => {}, { type: 'lower' })
    renderSummary(id)

    const curl = await screen.findByRole('region', { name: 'Sliding hamstring curl' })
    const stepper = within(curl).getByRole('group', { name: 'next resistance' })
    expect(stepper).toHaveTextContent('BW + 2.5 kg')

    vi.setSystemTime(Date.now() + MINUTE)
    await user.click(within(curl).getByRole('button', { name: 'Increase next resistance' }))
    await vi.waitFor(() => expect(stepper).toHaveTextContent('BW + 5 kg'))
    expect(await nextTarget('lower', 'sliding-hamstring-curl')).toEqual({ kind: 'reps', loadKg: 5, reps: [8, 8] })
  })

  it('offers a Copenhagen plank held 2 × 40 s per side the choice, restarting at 20 s', async () => {
    const user = userEvent.setup()
    await createOverride('copenhagen-plank', { kind: 'timed', loadKg: 0, seconds: 40, setsPerSide: 2 }, Date.now())
    vi.setSystemTime(Date.now() + MINUTE)
    const id = await finishWorkout(() => {}, { type: 'lower' })
    renderSummary(id)

    const plank = await screen.findByRole('region', { name: 'Copenhagen plank' })
    expect(plank).toHaveTextContent('ActualBW · L 40 / 40 s · R 40 / 40 s')
    expect(plank).toHaveTextContent('NextBW + 2.5 kg · 20 s per side × 2')
    expect(within(plank).getByText('Top of ladder — choose next resistance')).toBeInTheDocument()
    expect(within(plank).getByText('Back to 20 s per side. To stay at bodyweight, use a harder lever.')).toBeInTheDocument()
    const stepper = within(plank).getByRole('group', { name: 'next resistance' })
    expect(stepper).toHaveTextContent('BW + 2.5 kg')

    vi.setSystemTime(Date.now() + MINUTE)
    await user.click(within(plank).getByRole('button', { name: 'Stay at bodyweight' }))
    await vi.waitFor(() => expect(within(stepper).getByText('BW')).toBeInTheDocument())
    expect(await nextTarget('lower', 'copenhagen-plank')).toEqual({ kind: 'timed', loadKg: 0, seconds: 20, setsPerSide: 2 })

    vi.setSystemTime(Date.now() + MINUTE)
    await user.click(within(plank).getByRole('button', { name: 'Increase next resistance' }))
    await vi.waitFor(() => expect(stepper).toHaveTextContent('BW + 2.5 kg'))
    expect(await nextTarget('lower', 'copenhagen-plank')).toEqual({ kind: 'timed', loadKg: 2.5, seconds: 20, setsPerSide: 2 })
  })

  it("edits the other workout's next targets without touching the stored recommendation", async () => {
    const user = userEvent.setup()
    const id = await finishWorkout(() => {}, { warmup: jumpRope })
    renderSummary(id)
    const next = await nextSection('Lower body')

    vi.setSystemTime(Date.now() + MINUTE)
    await user.click(within(next).getByText('Hip thrust'))
    await user.click(screen.getByRole('radio', { name: '5 / 6 / 6' }))
    await user.click(screen.getByRole('button', { name: 'Save target' }))
    await vi.waitFor(() => expect(next).toHaveTextContent('Hip thrust40 kg · 5 / 6 / 6'))
    expect(await nextTarget('lower', 'hip-thrust')).toEqual({ kind: 'reps', loadKg: 40, reps: [5, 6, 6] })

    // The jump rope is shared: the next workout gets the edit, today's recommendation stays.
    vi.setSystemTime(Date.now() + MINUTE)
    await user.click(within(next).getByText('Jump rope'))
    await user.click(screen.getByRole('button', { name: 'Increase duration' }))
    await user.click(screen.getByRole('button', { name: 'Save target' }))
    await vi.waitFor(() => expect(next).toHaveTextContent('Jump rope2:15'))
    expect(block('Warm-up')).toHaveTextContent('Jump rope 2:00 ✅Next: 2:10')
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

  it('says so when the workout does not exist', async () => {
    renderSummary('no-such-workout')
    expect(await screen.findByRole('heading', { name: 'Workout not found' })).toBeInTheDocument()
  })
})

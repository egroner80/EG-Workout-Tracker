import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../data/db'
import { getSession } from '../../data/repositories/sessions'
import { updateMeta } from '../../data/repositories/settingsRepo'
import type { TemplateId } from '../../domain/types'
import { adjustEffort, startStrength, stepReps, toggleSkipSet } from '../../domain/workout/actions'
import { getCurrentPrescriptions } from '../../services/queries'
import { useWorkoutStore } from '../../state/workoutStore'
import { act, renderAt, resetApp, startWorkout } from '../../test/workoutHarness'
import { HistoryScreen } from './HistoryScreen'
import { SessionDetailScreen } from './SessionDetailScreen'

const DAY = 86_400_000

async function finish(record: () => void, type: TemplateId = 'upper'): Promise<string> {
  const session = await startWorkout(type)
  act(startStrength)
  record()
  vi.setSystemTime(Date.now() + 40 * 60_000)
  return useWorkoutStore.getState().finish(Object.fromEntries(session.exercises.map((e) => [e.exerciseId, 'done' as const])))
}

/** Stores a finished workout the way builds before the lower-body workout did: without a type. */
async function dropType(id: string) {
  const { templateId: _, ...legacy } = (await getSession(id))!
  await db.sessions.put(legacy)
}

function renderDetail(id: string) {
  return renderAt(<SessionDetailScreen />, `/history/${id}`, '/history/:sessionId')
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  await resetApp()
  await updateMeta({ soundCheckDone: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('session detail', () => {
  it('shows planned and actual values, skipped sets, and carry per-side times', async () => {
    const id = await finish(() => {
      act((s, ctx) => stepReps(s, 'db-row', 2, -1, ctx))
      act((s, ctx) => toggleSkipSet(s, 'dips', 1, ctx))
      act((s, ctx) => adjustEffort(s, 'suitcase-carry', 3, -5, ctx))
    })
    renderDetail(id)

    const row = await screen.findByRole('region', { name: 'One-arm DB row' })
    expect(screen.getByText('Upper body workout')).toBeInTheDocument()
    expect(row).toHaveTextContent('Planned18 kg · 4 / 4 / 4')
    expect(row).toHaveTextContent('Actual18 kg · 4 / 4 / 3')

    const dips = screen.getByRole('region', { name: 'Dips' })
    expect(dips).toHaveTextContent('ActualBW · 5 / – / 5')
    expect(dips).toHaveTextContent('Skipped1 set')

    const carry = screen.getByRole('region', { name: 'Suitcase carry' })
    expect(carry).toHaveTextContent('L 40 / 40 s · R 40 / 35 s')
    expect(within(carry).getByText('Carry')).toBeInTheDocument()
  })

  it('names a lower workout and shows its exercises and warm-up amounts', async () => {
    const id = await finish(() => {}, 'lower')
    renderDetail(id)

    expect(await screen.findByText('Lower body workout')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Bulgarian split squat' })).toHaveTextContent('Planned12 kg · 5 / 5 / 5')
    const plank = screen.getByRole('region', { name: 'Copenhagen plank' })
    expect(plank).toHaveTextContent('PlannedBW · 20 s per side × 2')
    expect(plank).toHaveTextContent('ActualBW · L 20 / 20 s · R 20 / 20 s')
    expect(within(plank).queryByText('Static hold')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Pull-ups' })).not.toBeInTheDocument()

    const warmup = screen.getByRole('region', { name: 'Warm-up' })
    expect(warmup).toHaveTextContent('Jump rope2:00 · not done')
    expect(warmup).toHaveTextContent('Bodyweight hip hinges10 reps · not done')
    expect(warmup).toHaveTextContent('Bodyweight Bulgarian split squat6 each side · not done')
    expect(warmup).toHaveTextContent('World’s greatest stretch30 s each side · not done')
  })

  it('reads a workout saved before workout types as upper body', async () => {
    const id = await finish(() => {})
    await dropType(id)
    renderDetail(id)
    expect(await screen.findByText('Upper body workout')).toBeInTheDocument()
  })

  it('marks a demo workout with its type', async () => {
    await resetApp({ demo: true })
    // Demo history alternates from upper; the second workout is lower.
    renderDetail('demo-02')
    expect(await screen.findByText('Demo · Lower body workout')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Copenhagen plank' })).toBeInTheDocument()
  })

  it('says so when the workout does not exist', async () => {
    renderDetail('no-such-workout')
    expect(await screen.findByRole('heading', { name: 'Workout not found' })).toBeInTheDocument()
  })

  it('deletes a workout after confirmation and targets fall back', async () => {
    const user = userEvent.setup()
    const id = await finish(() => {})
    expect((await getCurrentPrescriptions('upper')).get('db-row')?.source).toBe('recommendation')
    renderDetail(id)
    await user.click(await screen.findByRole('button', { name: 'Delete workout' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete workout' }))
    await vi.waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/history'))
    expect((await getCurrentPrescriptions('upper')).get('db-row')?.source).toBe('baseline')
  })
})

describe('history list', () => {
  it('labels every workout upper or lower, newest first, reading an untyped one as upper', async () => {
    const legacy = await finish(() => {})
    await dropType(legacy)
    vi.setSystemTime(Date.now() + DAY)
    await finish(() => {}, 'lower')
    vi.setSystemTime(Date.now() + DAY)
    await finish(() => {})
    renderAt(<HistoryScreen />, '/history')

    const rows = await screen.findAllByRole('link')
    expect(rows.map((row) => within(row).getByText(/^(Upper|Lower)$/).textContent)).toEqual(['Upper', 'Lower', 'Upper'])
    expect(rows[1]).toHaveTextContent('5/5 targets met')
  })

  it('shows the type next to the demo mark', async () => {
    await resetApp({ demo: true })
    renderAt(<HistoryScreen />, '/history')
    const [newest, previous] = await screen.findAllByRole('link')
    expect(within(newest).getByText('demo')).toBeInTheDocument()
    expect(within(newest).getByText('Lower')).toBeInTheDocument()
    expect(within(previous).getByText('Upper')).toBeInTheDocument()
  })
})

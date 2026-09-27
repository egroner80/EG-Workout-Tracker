import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateMeta } from '../../data/repositories/settingsRepo'
import { adjustEffort, startStrength, stepReps, toggleSkipSet } from '../../domain/workout/actions'
import { getCurrentPrescriptions } from '../../services/queries'
import { useWorkoutStore } from '../../state/workoutStore'
import { act, renderAt, resetApp, startWorkout } from '../../test/workoutHarness'
import { SessionDetailScreen } from './SessionDetailScreen'

async function finish(record: () => void): Promise<string> {
  const session = await startWorkout()
  act(startStrength)
  record()
  vi.setSystemTime(Date.now() + 40 * 60_000)
  return useWorkoutStore.getState().finish(Object.fromEntries(session.exercises.map((e) => [e.exerciseId, 'done' as const])))
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
    renderAt(<SessionDetailScreen />, `/history/${id}`, '/history/:sessionId')

    const row = await screen.findByRole('region', { name: 'One-arm DB row' })
    expect(row).toHaveTextContent('Planned18 kg · 5 / 5 / 5')
    expect(row).toHaveTextContent('Actual18 kg · 5 / 5 / 4')

    const dips = screen.getByRole('region', { name: 'Dips' })
    expect(dips).toHaveTextContent('ActualBW · 5 / – / 5')
    expect(dips).toHaveTextContent('Skipped1 set')

    const carry = screen.getByRole('region', { name: 'Suitcase carry' })
    expect(carry).toHaveTextContent('L 40 / 40 s · R 40 / 35 s')
    expect(within(carry).getByText('Carry')).toBeInTheDocument()
  })

  it('deletes a workout after confirmation and targets fall back', async () => {
    const user = userEvent.setup()
    const id = await finish(() => {})
    expect((await getCurrentPrescriptions()).get('db-row')?.source).toBe('recommendation')
    renderAt(<SessionDetailScreen />, `/history/${id}`, '/history/:sessionId')
    await user.click(await screen.findByRole('button', { name: 'Delete workout' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete workout' }))
    await vi.waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/history'))
    expect((await getCurrentPrescriptions()).get('db-row')?.source).toBe('baseline')
  })
})

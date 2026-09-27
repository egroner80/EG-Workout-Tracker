import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../data/db'
import { updateMeta } from '../../data/repositories/settingsRepo'
import { STALE_AFTER_MS } from '../../domain/session'
import { useWorkoutStore } from '../../state/workoutStore'
import { renderAt, resetApp, startWorkout } from '../../test/workoutHarness'
import { HomeScreen } from './HomeScreen'

beforeEach(async () => {
  await resetApp()
  await updateMeta({ soundCheckDone: true, installTipDismissed: true })
})

describe('Home', () => {
  it('shows START WORKOUT and the next workout with load and reps for every exercise', async () => {
    renderAt(<HomeScreen />, '/')
    expect(await screen.findByText('Pull-ups')).toBeInTheDocument()
    for (const [name, value] of [
      ['Pull-ups', 'BW · 5 / 5 / 5'],
      ['DB Row', '18 kg · 5 / 5 / 5'],
      ['DB Bench', '16 kg · 5 / 5 / 5'],
      ['DB Press', '12 kg · 5 / 5 / 5'],
      ['Hammer curls', '10 kg · 8 / 8'],
      ['Reverse crunch', '10 kg · 10 / 10 / 10'],
      ['Carry', '18 kg · 40 s per side × 2'],
    ]) {
      expect(screen.getByText(name).closest('li')).toHaveTextContent(value)
    }
    expect(screen.getByRole('button', { name: 'Start workout' })).toBeEnabled()
  })

  it('shows RESUME and no START while a workout is in progress', async () => {
    await startWorkout()
    renderAt(<HomeScreen />, '/')
    expect(await screen.findByRole('button', { name: 'Resume workout' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start workout' })).not.toBeInTheDocument()
  })

  it('offers Resume, Finish, and Discard for a stale workout', async () => {
    const session = await startWorkout()
    useWorkoutStore.setState({ session: { ...session, lastInteractionAt: Date.now() - STALE_AFTER_MS - 60_000 } })
    renderAt(<HomeScreen />, '/')
    expect(await screen.findByText(/Unfinished workout from/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Finish & save/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
  })

  it('offers to clear demo history at the first START', async () => {
    const user = userEvent.setup()
    await resetApp({ demo: true })
    await updateMeta({ soundCheckDone: true, installTipDismissed: true })
    renderAt(<HomeScreen />, '/')
    expect(await screen.findByText(/Demo history is loaded/)).toBeInTheDocument()
    await screen.findByText('Pull-ups')
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Start workout' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Start workout' }))
    await user.click(screen.getByRole('button', { name: /Clear demo & start/ }))
    await vi.waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/workout'))
    expect(await db.sessions.where('source').equals('demo').count()).toBe(0)
    expect(useWorkoutStore.getState().session).not.toBeNull()
  })
})

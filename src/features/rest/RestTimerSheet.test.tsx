import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateMeta } from '../../data/repositories/settingsRepo'
import { goToExercise, setRestExpanded, startRest, startStrength } from '../../domain/workout/actions'
import { act, advance, advanceFrames, renderAt, resetApp, startWorkout } from '../../test/workoutHarness'
import { WorkoutRoute } from '../workout/WorkoutRoute'

async function openExercise(exerciseId: string) {
  await startWorkout()
  act(startStrength)
  act((s, ctx) => goToExercise(s, exerciseId, ctx))
}

const rest = () => screen.getByRole('region', { name: 'Rest timer' })

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  await resetApp()
  await updateMeta({ soundCheckDone: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rest timer sizes', () => {
  it('extends, pauses, resumes, overruns, and closes, with one region and focus handed between sizes', async () => {
    const user = userEvent.setup()
    await openExercise('hammer-curls')
    renderAt(<WorkoutRoute />)
    await user.click(screen.getByRole('button', { name: /Start rest · 1:15/ }))
    expect(within(rest()).getByText('Rest')).toBeInTheDocument()
    expect(within(rest()).getByRole('timer')).toHaveTextContent(/^1:15$/)

    await user.click(within(rest()).getByRole('button', { name: 'Expand rest timer' }))
    expect(screen.getAllByRole('region', { name: 'Rest timer' })).toHaveLength(1)
    expect(within(rest()).getByRole('button', { name: 'Collapse rest timer' })).toHaveFocus()
    await user.click(within(rest()).getByRole('button', { name: '+15 s' }))
    expect(within(rest()).getByRole('timer')).toHaveTextContent(/^1:30$/)
    await user.click(within(rest()).getByRole('button', { name: 'Pause' }))
    advance(20_000)
    expect(within(rest()).getByText('Rest paused')).toBeInTheDocument()
    expect(within(rest()).getByRole('timer')).toHaveTextContent(/^1:30$/)

    await user.click(within(rest()).getByRole('button', { name: 'Collapse rest timer' }))
    expect(within(rest()).getByText('Rest paused')).toBeInTheDocument()
    expect(within(rest()).getByRole('timer')).toHaveTextContent(/^1:30$/)
    expect(within(rest()).getByRole('button', { name: 'Expand rest timer' })).toHaveFocus()

    await user.click(within(rest()).getByRole('button', { name: 'Expand rest timer' }))
    await user.click(within(rest()).getByRole('button', { name: 'Resume' }))
    advanceFrames(90_500)
    expect(within(rest()).getByText('Rest done')).toBeInTheDocument()
    advance(12_000)
    expect(within(rest()).getByRole('timer')).toHaveTextContent(/^\+0:12$/)

    await user.click(within(rest()).getByRole('button', { name: 'Collapse rest timer' }))
    expect(within(rest()).getByText('Rest done')).toBeInTheDocument()
    expect(within(rest()).getByRole('timer')).toHaveTextContent(/^\+0:12$/)
    await user.click(within(rest()).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name: 'Rest timer' })).not.toBeInTheDocument()
  })

  it('restores a rest saved while the large view was open as the large view alone', async () => {
    await openExercise('db-row')
    act((s, ctx) => startRest(s, 'db-row', ctx))
    act((s) => setRestExpanded(s, true))
    renderAt(<WorkoutRoute />)
    expect(screen.getAllByRole('region', { name: 'Rest timer' })).toHaveLength(1)
    expect(within(rest()).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand rest timer' })).not.toBeInTheDocument()
  })

  it('moves no focus when touching the card tucks the large view away', async () => {
    const user = userEvent.setup()
    await openExercise('db-row')
    renderAt(<WorkoutRoute />)
    await user.click(screen.getByRole('button', { name: /^Set 1: \d+ reps/ }))
    await user.click(screen.getByRole('button', { name: 'Expand rest timer' }))
    const minus = screen.getByRole('button', { name: 'Set 1: one rep fewer' })
    await user.click(minus)
    expect(screen.getByRole('button', { name: 'Expand rest timer' })).not.toHaveFocus()
  })
})

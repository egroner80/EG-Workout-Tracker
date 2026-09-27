import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateMeta } from '../../data/repositories/settingsRepo'
import { getTemplate, saveTemplate } from '../../data/repositories/templateRepo'
import { goToExercise, startStrength } from '../../domain/workout/actions'
import { useWorkoutStore } from '../../state/workoutStore'
import { act, advance, advanceFrames, renderAt, resetApp, startWorkout } from '../../test/workoutHarness'
import { WorkoutRoute } from './WorkoutRoute'

async function openExercise(exerciseId: string) {
  await startWorkout()
  act(startStrength)
  act((s, ctx) => goToExercise(s, exerciseId, ctx))
  return renderAt(<WorkoutRoute />)
}

const setChip = (n: number) => screen.getByRole('button', { name: new RegExp(`^Set ${n}: \\d+ reps`) })

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  await resetApp()
  await updateMeta({ soundCheckDone: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('exercise card', () => {
  it('shows the full prescription on one screen', async () => {
    await openExercise('db-row')
    expect(screen.getByRole('heading', { name: 'One-arm DB row', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('per side').closest('p')).toHaveTextContent('18 kg')
    expect(screen.getByText('5 — 5 — 5')).toBeInTheDocument()
    expect(screen.getByText('First time')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start rest · 1:30/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Set \d: 5 reps, not logged/ })).toHaveLength(3)
  })

  it('logs a set with one tap and opens the rest timer; a second tap undoes both', async () => {
    const user = userEvent.setup()
    await openExercise('db-row')
    await user.click(setChip(1))
    expect(setChip(1)).toHaveAttribute('aria-pressed', 'true')
    const rest = screen.getByRole('region', { name: 'Rest timer' })
    expect(within(rest).getByRole('timer')).toHaveTextContent('1:30')

    await user.click(setChip(1))
    expect(setChip(1)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('region', { name: 'Rest timer' })).not.toBeInTheDocument()
  })

  it('records fewer reps below the target while TODAY keeps the plan', async () => {
    const user = userEvent.setup()
    await openExercise('dips')
    await user.click(screen.getByRole('button', { name: 'Set 3: one rep fewer' }))
    expect(setChip(3)).toHaveAccessibleName(/Set 3: 4 reps, below target/)
    expect(screen.getByText('5 — 5 — 5')).toBeInTheDocument()
  })

  it('lowers the weight for sets not yet done and shows the planned load', async () => {
    const user = userEvent.setup()
    await openExercise('db-row')
    await user.click(screen.getByRole('button', { name: 'Decrease weight' }))
    const stepper = screen.getByRole('group', { name: 'weight' })
    expect(within(stepper).getByText('16 kg')).toBeInTheDocument()
    expect(screen.getByText('planned 18 kg')).toBeInTheDocument()
  })

  it('moves a bodyweight load through added and assisted weight', async () => {
    const user = userEvent.setup()
    await openExercise('pull-ups')
    const stepper = screen.getByRole('group', { name: 'weight' })
    await user.click(screen.getByRole('button', { name: 'Increase weight' }))
    expect(within(stepper).getByText('BW + 2.5 kg')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Decrease weight' }))
    await user.click(screen.getByRole('button', { name: 'Decrease weight' }))
    expect(within(stepper).getByText('Assisted −2.5 kg')).toBeInTheDocument()
  })

  it('keeps skip, add, delete, and rest-time edits behind Edit sets', async () => {
    const user = userEvent.setup()
    await openExercise('dips')
    expect(screen.queryByRole('button', { name: 'Add set' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit sets' }))
    await user.click(screen.getAllByRole('button', { name: 'Skip' })[1])
    expect(setChip(2)).toHaveAccessibleName(/skipped/)
    await user.click(screen.getByRole('button', { name: 'Add set' }))
    expect(screen.getAllByRole('button', { name: /^Set \d: \d+ reps/ })).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getAllByRole('button', { name: /^Set \d: \d+ reps/ })).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Increase rest time' }))
    expect(screen.getByRole('button', { name: /Start rest · 2:15/ })).toBeInTheDocument()
  })
})

describe('rest timer', () => {
  it('extends, pauses, resumes, cues at zero, shows overtime, and collapses', async () => {
    const user = userEvent.setup()
    await openExercise('hammer-curls')
    await user.click(screen.getByRole('button', { name: /Start rest · 1:15/ }))
    const rest = () => screen.getByRole('region', { name: 'Rest timer' })
    await user.click(within(rest()).getByRole('button', { name: '+15 s' }))
    expect(within(rest()).getByRole('timer')).toHaveTextContent('1:30')
    await user.click(within(rest()).getByRole('button', { name: 'Pause' }))
    advance(20_000)
    expect(within(rest()).getByRole('timer')).toHaveTextContent('1:30')
    await user.click(within(rest()).getByRole('button', { name: 'Resume' }))
    advanceFrames(90_500)
    expect(within(rest()).getByText('Rest done')).toBeInTheDocument()
    advance(12_000)
    expect(within(rest()).getByRole('timer')).toHaveTextContent('+0:12')

    await user.click(screen.getAllByRole('button', { name: 'Collapse rest timer' })[0])
    expect(screen.queryByRole('region', { name: 'Rest timer' })).not.toBeInTheDocument()
    expect(screen.getByRole('timer', { name: /Rest/ })).toBeInTheDocument()
  })

  it('logs the next set in one tap while the rest sheet is open', async () => {
    const user = userEvent.setup()
    await openExercise('db-row')
    await user.click(setChip(1))
    expect(screen.getByRole('region', { name: 'Rest timer' })).toBeInTheDocument()
    // The same tap collapses the sheet and logs set 2; its own rest then opens.
    await user.click(setChip(2))
    expect(setChip(2)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: 'Rest timer' })).toBeInTheDocument()
  })

  it('offers the next exercise once the current one is fully logged', async () => {
    const user = userEvent.setup()
    await openExercise('hammer-curls')
    await user.click(setChip(1))
    await user.click(setChip(2))
    await user.click(within(screen.getByRole('region', { name: 'Rest timer' })).getByRole('button', { name: /Next: Reverse crunch/ }))
    expect(screen.getByRole('heading', { name: 'Weighted reverse crunch', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('timer', { name: /Rest/ })).toBeInTheDocument()
  })
})

describe('navigation and finish', () => {
  it('moves between exercises and keeps entered values', async () => {
    const user = userEvent.setup()
    await openExercise('pull-ups')
    await user.click(setChip(1))
    await user.click(screen.getByRole('button', { name: 'Next: Dips' }))
    expect(screen.getByRole('heading', { name: 'Dips', level: 1 })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previous exercise' }))
    expect(setChip(1)).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Jump to exercise' }))
    await user.click(screen.getByRole('button', { name: /Suitcase carry/ }))
    expect(screen.getByRole('heading', { name: 'Suitcase carry', level: 1 })).toBeInTheDocument()
  })

  it('asks per exercise about unlogged sets with nothing preselected', async () => {
    const user = userEvent.setup()
    await openExercise('pull-ups')
    await user.click(setChip(1))
    await user.click(screen.getByRole('button', { name: 'Workout menu' }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    const dialog = screen.getByRole('dialog', { name: 'Finish workout?' })
    const finish = within(dialog).getByRole('button', { name: 'Finish workout' })
    expect(finish).toBeDisabled()
    const radios = within(dialog).getAllByRole('radio')
    expect(radios.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)
    await user.click(within(dialog).getByRole('button', { name: 'Keep going' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers Discard when nothing was logged', async () => {
    const user = userEvent.setup()
    await openExercise('pull-ups')
    await user.click(screen.getByRole('button', { name: 'Workout menu' }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    expect(screen.getByRole('dialog', { name: 'Nothing logged yet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard workout' })).toBeInTheDocument()
  })

  it('finishes and navigates to the summary once every exercise is resolved', async () => {
    const user = userEvent.setup()
    await openExercise('pull-ups')
    await user.click(setChip(1))
    await user.click(screen.getByRole('button', { name: 'Workout menu' }))
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    const dialog = screen.getByRole('dialog', { name: 'Finish workout?' })
    for (const radio of within(dialog).getAllByRole('radio', { name: 'Done as prescribed' })) await user.click(radio)
    await user.click(within(dialog).getByRole('button', { name: 'Finish workout' }))
    await vi.waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/summary\//))
    expect(useWorkoutStore.getState().session).toBeNull()
  })

  it('shows an empty state instead of crashing when the workout has no exercises', async () => {
    const user = userEvent.setup()
    await saveTemplate({ ...(await getTemplate()), exercises: [] })
    await startWorkout()
    act(startStrength)
    renderAt(<WorkoutRoute />)
    expect(await screen.findByRole('heading', { name: 'No exercises in this workout' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))
    expect(await screen.findByRole('dialog', { name: 'Nothing logged yet' })).toBeInTheDocument()
  })
})

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDay, formatTime } from '../../app/format'
import { db } from '../../data/db'
import { updateMeta } from '../../data/repositories/settingsRepo'
import { getTemplate } from '../../data/repositories/templateRepo'
import { createTemplate } from '../../data/seed/defaultTemplate'
import { STALE_AFTER_MS, buildSession, discardSession, finishSession, softDeleteSession } from '../../domain/session'
import type { SessionSource, TemplateId, WorkoutSession } from '../../domain/types'
import { startStrength } from '../../domain/workout/actions'
import { useWorkoutStore } from '../../state/workoutStore'
import { createOverride } from '../../services/dataCommands'
import { act, renderAt, resetApp, startWorkout } from '../../test/workoutHarness'
import { HomeScreen } from './HomeScreen'

const HOUR = 3600_000
const DAY = 24 * HOUR

/** A finished workout written straight to history; it started an hour before it finished. */
async function addFinished(
  id: string,
  templateId: TemplateId,
  finishedAt: number,
  source: SessionSource = 'real',
): Promise<WorkoutSession> {
  const session = buildSession({ id, now: finishedAt - HOUR, template: createTemplate(templateId), prescriptions: new Map(), source })
  const finished = finishSession(session, { now: finishedAt })
  await db.sessions.add(finished)
  return finished
}

/** Finishes the workout in progress with every set done as planned. */
function finishAsPlanned(session: WorkoutSession): Promise<string> {
  act(startStrength)
  return useWorkoutStore.getState().finish(Object.fromEntries(session.exercises.map((e) => [e.exerciseId, 'done' as const])))
}

const nextWorkout = () => screen.getByRole('region', { name: /^Next workout/ })
const suggestion = () => within(nextWorkout()).getByText(/^Suggested:/)
const recentRows = () => within(screen.getByRole('region', { name: 'Recent' })).getAllByRole('link')

beforeEach(async () => {
  await resetApp()
  await updateMeta({ soundCheckDone: true, installTipDismissed: true })
})

describe('Home', () => {
  it('shows START and the next workout with load and reps for every exercise', async () => {
    renderAt(<HomeScreen />, '/')
    expect(await screen.findByText('Pull-ups')).toBeInTheDocument()
    for (const [name, value] of [
      ['Pull-ups', 'BW · 5 / 5 / 5'],
      ['DB Row', '18 kg · 4 / 4 / 4'],
      ['DB Bench', '16 kg · 4 / 4 / 4'],
      ['DB Press', '12 kg · 4 / 4 / 4'],
      ['Hammer curls', '10 kg · 6 / 6'],
      ['Reverse crunch', '10 kg · 8 / 8 / 8'],
      ['Carry', '18 kg · 40 s per side × 2'],
    ]) {
      expect(screen.getByText(name).closest('li')).toHaveTextContent(value)
    }
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Start upper body' })).toBeEnabled())
  })

  it('suggests upper body before any real workout', async () => {
    renderAt(<HomeScreen />, '/')
    expect(await screen.findByRole('radio', { name: 'Upper body' })).toBeChecked()
    expect(suggestion()).toHaveTextContent(/^Suggested: Upper body$/)
    expect(within(screen.getByRole('region', { name: 'Recent' })).getByText('No workouts yet')).toBeInTheDocument()
  })

  it('preselects the other workout than the newest one and says why', async () => {
    const newest = await addFinished('u1', 'upper', Date.now() - DAY)
    renderAt(<HomeScreen />, '/')
    expect(await screen.findByRole('radio', { name: 'Lower body' })).toBeChecked()
    expect(suggestion()).toHaveTextContent(`Suggested: Lower body · last workout was upper, ${formatDay(newest.startedAt)}`)
    expect(within(nextWorkout()).getByText('Split squat').closest('li')).toHaveTextContent('12 kg · 5 / 5 / 5')
    expect(within(nextWorkout()).queryByText('Pull-ups')).not.toBeInTheDocument()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Start lower body' })).toBeEnabled())
  })

  it('starts the workout switched to, then suggests the other one once it is done', async () => {
    const user = userEvent.setup()
    await addFinished('u1', 'upper', Date.now() - DAY)
    const { unmount } = renderAt(<HomeScreen />, '/')
    await user.click(await screen.findByRole('radio', { name: 'Upper body' }))
    expect(screen.getByRole('radio', { name: 'Upper body' })).toBeChecked()
    expect(within(nextWorkout()).getByText('Pull-ups')).toBeInTheDocument()
    expect(within(nextWorkout()).queryByText('Split squat')).not.toBeInTheDocument()
    // The caption keeps naming the suggestion; it is advice, not a rule.
    expect(suggestion()).toHaveTextContent('Suggested: Lower body')

    const start = screen.getByRole('button', { name: 'Start upper body' })
    await vi.waitFor(() => expect(start).toBeEnabled())
    await user.click(start)
    await vi.waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/workout'))
    const session = useWorkoutStore.getState().session
    expect(session?.templateId).toBe('upper')

    await finishAsPlanned(session!)
    unmount()
    renderAt(<HomeScreen />, '/')
    expect(await screen.findByRole('radio', { name: 'Lower body' })).toBeChecked()
    expect(suggestion()).toHaveTextContent(`last workout was upper, ${formatDay(session!.startedAt)}`)
  })

  it('starts from the suggestion again each time Home opens', async () => {
    const user = userEvent.setup()
    await addFinished('u1', 'upper', Date.now() - DAY)
    const { unmount } = renderAt(<HomeScreen />, '/')
    await user.click(await screen.findByRole('radio', { name: 'Upper body' }))
    expect(screen.getByRole('radio', { name: 'Upper body' })).toBeChecked()
    unmount()

    renderAt(<HomeScreen />, '/')
    expect(await screen.findByRole('radio', { name: 'Lower body' })).toBeChecked()
    expect(within(nextWorkout()).getByText('Split squat')).toBeInTheDocument()
  })

  it('suggests from finished real workouts only; one saved before workout types existed counts as upper body', async () => {
    const now = Date.now()
    const { templateId: _untyped, ...legacy } = await addFinished('legacy', 'upper', now - 5 * DAY)
    await db.sessions.put(legacy)
    const deleted = await addFinished('gone', 'lower', now - 3 * DAY)
    await db.sessions.put(softDeleteSession(deleted, now - 3 * DAY + HOUR))
    const thrown = buildSession({ id: 'thrown', now: now - 2 * DAY, template: createTemplate('lower'), prescriptions: new Map() })
    await db.sessions.add(discardSession(thrown, now - 2 * DAY + HOUR))
    await addFinished('demo-01', 'lower', now - DAY, 'demo')

    renderAt(<HomeScreen />, '/')
    expect(await screen.findByRole('radio', { name: 'Lower body' })).toBeChecked()
    expect(suggestion()).toHaveTextContent(`Suggested: Lower body · last workout was upper, ${formatDay(legacy.startedAt)}`)
    expect(recentRows().map((row) => row.textContent)).toEqual([`${formatDay(legacy.startedAt)} · Upper body`])
  })

  it('changes the suggestion only by what remains after deleting or discarding a workout', async () => {
    const now = Date.now()
    const upper = await addFinished('u1', 'upper', now - 2 * DAY)
    const lower = await addFinished('l1', 'lower', now - DAY)
    renderAt(<HomeScreen />, '/')
    expect(await screen.findByRole('radio', { name: 'Upper body' })).toBeChecked()

    await db.sessions.put(softDeleteSession(lower, now))
    await vi.waitFor(() => expect(screen.getByRole('radio', { name: 'Lower body' })).toBeChecked())
    expect(suggestion()).toHaveTextContent(`last workout was upper, ${formatDay(upper.startedAt)}`)

    await startWorkout('lower')
    expect(await screen.findByRole('region', { name: 'Next workout after this one' })).toBeInTheDocument()
    await useWorkoutStore.getState().discard()
    await vi.waitFor(() => expect(screen.getByRole('radio', { name: 'Lower body' })).toBeChecked())
    expect(suggestion()).toHaveTextContent(`last workout was upper, ${formatDay(upper.startedAt)}`)
  })

  it('shows RESUME and previews the other workout while one is in progress', async () => {
    const session = await startWorkout('lower')
    renderAt(<HomeScreen />, '/')
    expect(await screen.findByRole('button', { name: 'Resume workout' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Start/ })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Workout in progress' })).toHaveTextContent(
      `Lower body in progress · started ${formatTime(session.startedAt)}`,
    )

    const next = screen.getByRole('region', { name: 'Next workout after this one' })
    expect(await within(next).findByText('Pull-ups')).toBeInTheDocument()
    expect(within(next).getByText('Upper body')).toBeInTheDocument()
    expect(within(next).queryByRole('radiogroup')).not.toBeInTheDocument()
    // Targets are read-only until the workout in progress is finished.
    expect(within(next).queryByRole('button')).not.toBeInTheDocument()
  })

  it('treats a reopened lower-body workout as in progress, so upper body comes next', async () => {
    const lower = await startWorkout('lower')
    const id = await finishAsPlanned(lower)
    await useWorkoutStore.getState().reopen(id)
    renderAt(<HomeScreen />, '/')
    expect(await screen.findByText(/^Editing a finished lower-body workout/)).toHaveTextContent(
      `Editing a finished lower-body workout · started ${formatTime(lower.startedAt)}`,
    )
    const next = screen.getByRole('region', { name: 'Next workout after this one' })
    expect(await within(next).findByText('Pull-ups')).toBeInTheDocument()
    expect(within(next).getByText('Upper body')).toBeInTheDocument()
  })

  it('names the type of a stale workout and offers Resume, Finish, and Discard', async () => {
    const session = await startWorkout('lower')
    useWorkoutStore.setState({ session: { ...session, lastInteractionAt: Date.now() - STALE_AFTER_MS - 60_000 } })
    renderAt(<HomeScreen />, '/')
    expect(await screen.findByText(/^Unfinished lower-body workout from/)).toHaveTextContent(
      `Unfinished lower-body workout from ${formatDay(session.startedAt)} ${formatTime(session.startedAt)}`,
    )
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Finish & save/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
    const next = screen.getByRole('region', { name: 'Next workout after this one' })
    expect(await within(next).findByText('Upper body')).toBeInTheDocument()
  })

  it('lists the four newest workouts with their type and date, each opening its detail', async () => {
    const user = userEvent.setup()
    const now = Date.now()
    await addFinished('w1', 'upper', now - 5 * DAY)
    const w2 = await addFinished('w2', 'lower', now - 4 * DAY)
    const w3 = await addFinished('w3', 'upper', now - 3 * DAY)
    const w4 = await addFinished('w4', 'lower', now - 2 * DAY)
    const w5 = await addFinished('w5', 'upper', now - DAY)
    renderAt(<HomeScreen />, '/')
    await screen.findByRole('region', { name: 'Recent' })
    expect(recentRows().map((row) => row.textContent)).toEqual([
      `${formatDay(w5.startedAt)} · Upper body`,
      `${formatDay(w4.startedAt)} · Lower body`,
      `${formatDay(w3.startedAt)} · Upper body`,
      `${formatDay(w2.startedAt)} · Lower body`,
    ])
    await user.click(recentRows()[1])
    expect(screen.getByTestId('location')).toHaveTextContent('/history/w4')
  })

  it('flags a next target kept below its rep range', async () => {
    const curls = createTemplate('upper').exercises.find((e) => e.id === 'hammer-curls')
    if (curls?.kind !== 'reps') throw new Error('expected a reps exercise')
    await createOverride('hammer-curls', { kind: 'reps', loadKg: 10, reps: [3, 4] }, Date.now())
    renderAt(<HomeScreen />, '/')
    const note = `Below the ${curls.scheme.minReps}–${curls.scheme.maxReps} rep range`
    const row = await screen.findByRole('button', { name: `Hammer curls: 10 kg · 3 / 4. ${note}. Edit next target` })
    expect(row).toHaveTextContent(note)
    expect(screen.getByRole('button', { name: /^DB Row: [^.]+\. Edit next target$/ })).toBeInTheDocument()
  })

  it('edits the targets of the workout shown', async () => {
    const user = userEvent.setup()
    renderAt(<HomeScreen />, '/')
    await user.click(await screen.findByRole('radio', { name: 'Lower body' }))
    await user.click(screen.getByRole('button', { name: 'Split squat: 12 kg · 5 / 5 / 5. Edit next target' }))
    await user.click(screen.getByRole('button', { name: 'Increase number of sets' }))
    await user.click(screen.getByRole('button', { name: 'Save target' }))
    expect(
      await screen.findByRole('button', { name: 'Split squat: 12 kg · 5 / 5 / 5 / 5. Edit next target' }),
    ).toBeInTheDocument()
    const lower = await getTemplate('lower')
    expect(lower.exercises.find((e) => e.id === 'bulgarian-split-squat')).toMatchObject({ scheme: { sets: 4 } })
  })

  it('times a per-side warm-up step on each side and a rep step once', async () => {
    const user = userEvent.setup()
    renderAt(<HomeScreen />, '/')
    // Rope 2:00, the squat routine's holds 2:00 and slow squats 0:30, four drills 3:00.
    expect(await screen.findByRole('button', { name: 'Warm-up: 8:00. Edit next target' })).toHaveTextContent('Jump rope 2:00')
    await user.click(screen.getByRole('radio', { name: 'Lower body' }))
    // The same 4:30, three drills 2:15, the world's greatest stretch 0:30 on each side,
    // hip hinges 0:30, split squats 1:00 for both sides, glute bridges 0:40.
    expect(screen.getByRole('button', { name: 'Warm-up: 9:55. Edit next target' })).toHaveTextContent('Jump rope 2:00')
  })

  it('offers to clear demo history at the first START, then starts the workout selected', async () => {
    const user = userEvent.setup()
    await resetApp({ demo: true })
    await updateMeta({ soundCheckDone: true, installTipDismissed: true })
    renderAt(<HomeScreen />, '/')
    expect(await screen.findByText(/Demo history is loaded/)).toBeInTheDocument()
    // Demo workouts never count: upper body is suggested and nothing is recent.
    expect(await screen.findByRole('radio', { name: 'Upper body' })).toBeChecked()
    expect(suggestion()).toHaveTextContent(/^Suggested: Upper body$/)
    expect(within(screen.getByRole('region', { name: 'Recent' })).getByText('No workouts yet')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Lower body' }))
    const start = screen.getByRole('button', { name: 'Start lower body' })
    await vi.waitFor(() => expect(start).toBeEnabled())
    await user.click(start)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Clear demo & start/ }))
    await vi.waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/workout'))
    expect(await db.sessions.where('source').equals('demo').count()).toBe(0)
    expect(useWorkoutStore.getState().session?.templateId).toBe('lower')
  })

  it('routes an unreadable stored workout to the recovery screen instead of offering START', async () => {
    const user = userEvent.setup()
    useWorkoutStore.setState({ recovery: { message: 'The saved workout could not be read.', raw: { id: 'broken' } } })
    renderAt(<HomeScreen />, '/')
    expect(await screen.findByText('A saved workout can’t be opened')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Start upper body' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Review it' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/workout')
    useWorkoutStore.setState({ recovery: null })
  })

  it('locks the workout switch while a start is in progress', async () => {
    renderAt(<HomeScreen />, '/')
    const lower = await screen.findByRole('radio', { name: 'Lower body' })
    expect(lower).toBeEnabled()
    useWorkoutStore.setState({ busy: true })
    await vi.waitFor(() => expect(lower).toBeDisabled())
    expect(screen.getByRole('radio', { name: 'Upper body' })).toBeDisabled()
  })
})

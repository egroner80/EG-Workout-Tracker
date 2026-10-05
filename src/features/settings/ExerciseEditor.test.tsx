import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listHistory } from '../../data/repositories/sessions'
import { updateMeta } from '../../data/repositories/settingsRepo'
import { getTemplate, saveTemplate } from '../../data/repositories/templateRepo'
import { getCurrentPrescriptions } from '../../services/queries'
import { useWorkoutStore } from '../../state/workoutStore'
import { completeWorkout, renderAt, resetApp, startWorkout } from '../../test/workoutHarness'
import { HomeScreen } from '../home/HomeScreen'
import { SettingsScreen } from './SettingsScreen'

const renderSettings = (path: string) => renderAt(<SettingsScreen />, path, '/settings/*')

beforeEach(async () => {
  await resetApp()
  await updateMeta({ soundCheckDone: true, installTipDismissed: true })
})

describe('exercise editor', () => {
  it('applies a set-count change at the current load and a new rest time to the next workout', async () => {
    const user = userEvent.setup({ delay: null })
    await completeWorkout()
    expect((await getCurrentPrescriptions('upper')).get('db-row')?.prescription).toMatchObject({ loadKg: 18, reps: [4, 4, 5] })

    renderSettings('/settings/upper/exercises/db-row')
    await screen.findByRole('heading', { level: 1, name: 'One-arm DB row' })
    await user.click(screen.getByRole('button', { name: 'Increase sets' }))
    await vi.waitFor(() => expect(screen.getByText('18 kg · 4 / 4 / 4 / 4')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Increase rest time' }))
    await user.click(screen.getByRole('button', { name: 'Increase rest time' }))
    await vi.waitFor(() => expect(screen.getByRole('group', { name: 'rest time' })).toHaveTextContent('2:00'))

    const next = await startWorkout()
    const row = next.exercises.find((e) => e.exerciseId === 'db-row')
    expect(row?.kind === 'reps' && row.planned).toEqual({ loadKg: 18, sets: [{ reps: 4 }, { reps: 4 }, { reps: 4 }, { reps: 4 }] })
    expect(row?.restSec).toBe(120)
  })

  it('changes Pull-ups to 4 sets and 150 s rest', async () => {
    const user = userEvent.setup({ delay: null })
    renderSettings('/settings/upper/exercises/pull-ups')
    await screen.findByRole('heading', { level: 1, name: 'Pull-ups' })
    await user.click(screen.getByRole('button', { name: 'Increase sets' }))
    await vi.waitFor(() => expect(screen.getByText('BW · 5 / 5 / 5 / 5')).toBeInTheDocument())
    for (let i = 0; i < 2; i++) await user.click(screen.getByRole('button', { name: 'Increase rest time' }))
    await vi.waitFor(() => expect(screen.getByRole('group', { name: 'rest time' })).toHaveTextContent('2:30'))

    const next = await startWorkout()
    expect(next.exercises.find((e) => e.exerciseId === 'pull-ups')).toMatchObject({ restSec: 150 })
  })

  it('adds an exercise that shows in NEXT WORKOUT, and removing it keeps its history', async () => {
    const user = userEvent.setup({ delay: null })
    const view = renderSettings('/settings/upper/exercises/new')
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Face pulls')
    await user.click(screen.getByRole('radio', { name: 'Weight' }))
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: 'Increase starting weight' }))
    for (let i = 0; i < 2; i++) await user.click(screen.getByRole('button', { name: 'Increase fewest reps' }))
    for (let i = 0; i < 2; i++) await user.click(screen.getByRole('button', { name: 'Decrease rest time' }))
    expect(screen.getByRole('group', { name: 'starting weight' })).toHaveTextContent('20 kg')
    await user.click(screen.getByRole('button', { name: 'Add to workout' }))
    await vi.waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/settings\/upper\/exercises$/))
    expect(await screen.findByText('Face pulls')).toBeInTheDocument()

    view.unmount()
    renderAt(<HomeScreen />, '/')
    expect((await screen.findByText('Face pulls')).closest('li')).toHaveTextContent('20 kg · 10 / 10 / 10')

    const sessionId = await completeWorkout()
    const face = (await getTemplate('upper')).exercises.find((e) => e.name === 'Face pulls')!
    expect(face).toMatchObject({ restSec: 60, loadType: 'weight', scheme: { sets: 3, minReps: 10, maxReps: 12 } })

    renderSettings(`/settings/upper/exercises/${face.id}`)
    await user.click(await screen.findByRole('button', { name: 'Remove from workout' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await vi.waitFor(async () => expect((await getTemplate('upper')).exercises.some((e) => e.id === face.id)).toBe(false))

    const history = await listHistory()
    expect(history.find((s) => s.id === sessionId)?.exercises.some((e) => e.name === 'Face pulls')).toBe(true)
  }, 15_000)

  it('reorders exercises for the next workout', async () => {
    const user = userEvent.setup({ delay: null })
    renderSettings('/settings/upper/exercises')
    await user.click(await screen.findByRole('button', { name: 'Move DB bench press up' }))
    await vi.waitFor(async () =>
      expect((await getTemplate('upper')).exercises.map((e) => e.id).slice(0, 4)).toEqual(['pull-ups', 'dips', 'db-bench', 'db-row']),
    )
    expect(screen.getByRole('button', { name: 'Move Pull-ups up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Suitcase carry down' })).toBeDisabled()
  })

  it('edits the next target through the target editor', async () => {
    const user = userEvent.setup({ delay: null })
    renderSettings('/settings/upper/exercises/db-press')
    await user.click(await screen.findByRole('button', { name: 'Edit target' }))
    const sheet = await screen.findByRole('dialog', { name: 'Standing DB press' })
    await user.click(within(sheet).getByRole('button', { name: 'Increase weight' }))
    await user.click(within(sheet).getByRole('button', { name: 'Save target' }))
    await vi.waitFor(() => expect(screen.getByText('14 kg · 4 / 4 / 4')).toBeInTheDocument())
    expect(screen.getByText('Set by you.')).toBeInTheDocument()
  })

  it('edits the carry time range and weight step', async () => {
    const user = userEvent.setup({ delay: null })
    renderSettings('/settings/upper/exercises/suitcase-carry')
    await user.click(await screen.findByRole('button', { name: 'Increase top time' }))
    await user.click(screen.getByRole('button', { name: 'Decrease weight step' }))
    await vi.waitFor(async () => {
      const carry = (await getTemplate('upper')).exercises.find((e) => e.id === 'suitcase-carry')
      expect(carry).toMatchObject({ loadStepKg: 1.25, scheme: { minSec: 40, maxSec: 65, stepSec: 5, setsPerSide: 2 } })
    })
  })

  it('keeps the target read-only while a workout is in progress', async () => {
    await startWorkout()
    renderSettings('/settings/upper/exercises/db-row')
    expect(await screen.findByRole('button', { name: 'Edit target' })).toBeDisabled()
    expect(screen.getByText('Finish the workout in progress to change it.')).toBeInTheDocument()
    expect(useWorkoutStore.getState().session).not.toBeNull()
  })

  it('keeps at least one exercise in the workout', async () => {
    const template = await getTemplate('upper')
    await saveTemplate({ ...template, exercises: template.exercises.filter((e) => e.id === 'pull-ups') })
    renderSettings('/settings/upper/exercises/pull-ups')
    expect(await screen.findByRole('button', { name: 'Remove from workout' })).toBeDisabled()
    expect(screen.getByText('A workout needs at least one exercise.')).toBeInTheDocument()
  })
})

describe('exercise editor for each workout', () => {
  it('opens the lower-body exercises from Settings and edits one in lower only', async () => {
    const user = userEvent.setup({ delay: null })
    const upperBefore = await getTemplate('upper')
    renderSettings('/settings')
    await user.click(await screen.findByRole('link', { name: 'Lower body exercises, order, sets, and rest' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Lower body exercises' })).toBeInTheDocument()

    await user.click(await screen.findByRole('link', { name: /^Single-leg hip thrust/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Single-leg hip thrust' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/settings\/lower\/exercises\/single-leg-hip-thrust$/)
    expect(screen.getByRole('link', { name: 'Lower body exercises' })).toHaveAttribute('href', '/settings/lower/exercises')

    await user.click(screen.getByRole('button', { name: 'Increase rest time' }))
    await vi.waitFor(() => expect(screen.getByRole('group', { name: 'rest time' })).toHaveTextContent('1:45'))
    expect((await getTemplate('lower')).exercises.find((e) => e.id === 'single-leg-hip-thrust')?.restSec).toBe(105)
    expect(await getTemplate('upper')).toEqual(upperBefore)

    const next = await startWorkout('lower')
    expect(next.exercises.find((e) => e.exerciseId === 'single-leg-hip-thrust')?.restSec).toBe(105)
  })

  it('reorders the lower-body exercises without touching upper', async () => {
    const user = userEvent.setup({ delay: null })
    const upperBefore = await getTemplate('upper')
    renderSettings('/settings/lower/exercises')
    await user.click(await screen.findByRole('button', { name: 'Move Single-leg hip thrust up' }))
    await vi.waitFor(async () =>
      expect((await getTemplate('lower')).exercises.map((e) => e.id).slice(0, 3)).toEqual([
        'bulgarian-split-squat',
        'single-leg-hip-thrust',
        'single-leg-rdl',
      ]),
    )
    expect(screen.getByRole('button', { name: 'Move Copenhagen plank down' })).toBeDisabled()
    expect(await getTemplate('upper')).toEqual(upperBefore)
  })

  it('lands the old settings paths on the upper-body pages', async () => {
    const list = renderSettings('/settings/exercises')
    expect(await screen.findByRole('heading', { level: 1, name: 'Upper body exercises' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/settings\/upper\/exercises$/)
    list.unmount()

    const detail = renderSettings('/settings/exercises/db-row')
    expect(await screen.findByRole('heading', { level: 1, name: 'One-arm DB row' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/settings\/upper\/exercises\/db-row$/)
    detail.unmount()

    renderSettings('/settings/warmup')
    expect(await screen.findByRole('heading', { level: 1, name: 'Upper body warm-up' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/settings\/upper\/warmup$/)
  })

  it('sends a workout path without a page, or an unknown page, back to Settings', async () => {
    const workout = renderSettings('/settings/lower')
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/settings$/)
    workout.unmount()

    renderSettings('/settings/lower/exercises/single-leg-hip-thrust/history')
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/settings$/)
  })

  it('adds an exercise to the lower-body workout only', async () => {
    const user = userEvent.setup({ delay: null })
    renderSettings('/settings/lower/exercises')
    await user.click(await screen.findByRole('link', { name: 'Add exercise' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'New exercise' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lower body exercises' })).toHaveAttribute('href', '/settings/lower/exercises')
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Nordic curls')
    await user.click(screen.getByRole('radio', { name: 'Bodyweight' }))
    await user.click(screen.getByRole('button', { name: 'Add to workout' }))

    await vi.waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/settings\/lower\/exercises$/))
    expect(await screen.findByText('Nordic curls')).toBeInTheDocument()
    expect((await getTemplate('lower')).exercises.at(-1)).toMatchObject({ name: 'Nordic curls', loadType: 'bodyweight' })
    expect((await getTemplate('upper')).exercises.some((e) => e.name === 'Nordic curls')).toBe(false)
  })

  it('removes a lower-body exercise and returns to the lower-body list', async () => {
    const user = userEvent.setup({ delay: null })
    renderSettings('/settings/lower/exercises/sliding-hamstring-curl')
    await user.click(await screen.findByRole('button', { name: 'Remove from workout' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await vi.waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/settings\/lower\/exercises$/))
    expect((await getTemplate('lower')).exercises.some((e) => e.id === 'sliding-hamstring-curl')).toBe(false)
  })

  it('keeps the Copenhagen plank a hold through edits, with no control for its style', async () => {
    const user = userEvent.setup({ delay: null })
    renderSettings('/settings/lower/exercises/copenhagen-plank')
    expect(await screen.findByRole('heading', { level: 1, name: 'Copenhagen plank' })).toBeInTheDocument()
    expect(screen.getAllByRole('radiogroup').map((group) => group.getAttribute('aria-label'))).toEqual(['Load type'])

    await user.click(screen.getByRole('button', { name: 'Increase top time' }))
    await user.click(screen.getByRole('radio', { name: 'Dumbbell' }))
    await vi.waitFor(async () => {
      const plank = (await getTemplate('lower')).exercises.find((e) => e.id === 'copenhagen-plank')
      expect(plank).toMatchObject({ style: 'hold', loadType: 'dumbbell', scheme: { minSec: 20, maxSec: 45 } })
    })
  })

  it('keeps at least one exercise in each workout', async () => {
    const lower = await getTemplate('lower')
    await saveTemplate({ ...lower, exercises: lower.exercises.filter((e) => e.id === 'single-leg-hip-thrust') })
    const view = renderSettings('/settings/lower/exercises/single-leg-hip-thrust')
    expect(await screen.findByRole('button', { name: 'Remove from workout' })).toBeDisabled()
    expect(screen.getByText('A workout needs at least one exercise.')).toBeInTheDocument()
    view.unmount()

    // Upper keeps all its exercises, so one can still go.
    renderSettings('/settings/upper/exercises/pull-ups')
    expect(await screen.findByRole('button', { name: 'Remove from workout' })).toBeEnabled()
  })

  it('treats an exercise of the other workout as not in this one', async () => {
    renderSettings('/settings/lower/exercises/db-row')
    expect(
      await screen.findByText('This exercise is no longer in your workout. Its past workouts are still in History.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lower body exercises' })).toHaveAttribute('href', '/settings/lower/exercises')
  })
})

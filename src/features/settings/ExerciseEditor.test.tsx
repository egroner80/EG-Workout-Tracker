import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listHistory } from '../../data/repositories/sessions'
import { updateMeta } from '../../data/repositories/settingsRepo'
import { getTemplate } from '../../data/repositories/templateRepo'
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
    expect((await getCurrentPrescriptions()).get('db-row')?.prescription).toMatchObject({ loadKg: 18, reps: [5, 5, 6] })

    renderSettings('/settings/exercises/db-row')
    await screen.findByRole('heading', { level: 1, name: 'One-arm DB row' })
    await user.click(screen.getByRole('button', { name: 'Increase sets' }))
    await vi.waitFor(() => expect(screen.getByText('18 kg · 5 / 5 / 5 / 5')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Increase rest time' }))
    await user.click(screen.getByRole('button', { name: 'Increase rest time' }))
    await vi.waitFor(() => expect(screen.getByRole('group', { name: 'rest time' })).toHaveTextContent('2:00'))

    const next = await startWorkout()
    const row = next.exercises.find((e) => e.exerciseId === 'db-row')
    expect(row?.kind === 'reps' && row.planned).toEqual({ loadKg: 18, sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }, { reps: 5 }] })
    expect(row?.restSec).toBe(120)
  })

  it('changes Pull-ups to 4 sets and 150 s rest', async () => {
    const user = userEvent.setup({ delay: null })
    renderSettings('/settings/exercises/pull-ups')
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
    const view = renderSettings('/settings/exercises/new')
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Face pulls')
    await user.click(screen.getByRole('radio', { name: 'Weight' }))
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: 'Increase starting weight' }))
    for (let i = 0; i < 2; i++) await user.click(screen.getByRole('button', { name: 'Increase fewest reps' }))
    for (let i = 0; i < 2; i++) await user.click(screen.getByRole('button', { name: 'Decrease rest time' }))
    expect(screen.getByRole('group', { name: 'starting weight' })).toHaveTextContent('20 kg')
    await user.click(screen.getByRole('button', { name: 'Add to workout' }))
    await vi.waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/settings/exercises'))
    expect(await screen.findByText('Face pulls')).toBeInTheDocument()

    view.unmount()
    renderAt(<HomeScreen />, '/')
    expect((await screen.findByText('Face pulls')).closest('li')).toHaveTextContent('20 kg · 10 / 10 / 10')

    const sessionId = await completeWorkout()
    const face = (await getTemplate()).exercises.find((e) => e.name === 'Face pulls')!
    expect(face).toMatchObject({ restSec: 60, loadType: 'weight', scheme: { sets: 3, minReps: 10, maxReps: 12 } })

    renderSettings(`/settings/exercises/${face.id}`)
    await user.click(await screen.findByRole('button', { name: 'Remove from workout' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await vi.waitFor(async () => expect((await getTemplate()).exercises.some((e) => e.id === face.id)).toBe(false))

    const history = await listHistory()
    expect(history.find((s) => s.id === sessionId)?.exercises.some((e) => e.name === 'Face pulls')).toBe(true)
  }, 15_000)

  it('reorders exercises for the next workout', async () => {
    const user = userEvent.setup({ delay: null })
    renderSettings('/settings/exercises')
    await user.click(await screen.findByRole('button', { name: 'Move DB bench press up' }))
    await vi.waitFor(async () =>
      expect((await getTemplate()).exercises.map((e) => e.id).slice(0, 4)).toEqual(['pull-ups', 'dips', 'db-bench', 'db-row']),
    )
    expect(screen.getByRole('button', { name: 'Move Pull-ups up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Suitcase carry down' })).toBeDisabled()
  })

  it('edits the next target through the target editor', async () => {
    const user = userEvent.setup({ delay: null })
    renderSettings('/settings/exercises/db-press')
    await user.click(await screen.findByRole('button', { name: 'Edit target' }))
    const sheet = await screen.findByRole('dialog', { name: 'Standing DB press' })
    await user.click(within(sheet).getByRole('button', { name: 'Increase weight' }))
    await user.click(within(sheet).getByRole('button', { name: 'Save target' }))
    await vi.waitFor(() => expect(screen.getByText('14 kg · 5 / 5 / 5')).toBeInTheDocument())
    expect(screen.getByText('Set by you.')).toBeInTheDocument()
  })

  it('edits the carry time range and weight step', async () => {
    const user = userEvent.setup({ delay: null })
    renderSettings('/settings/exercises/suitcase-carry')
    await user.click(await screen.findByRole('button', { name: 'Increase top time' }))
    await user.click(screen.getByRole('button', { name: 'Decrease weight step' }))
    await vi.waitFor(async () => {
      const carry = (await getTemplate()).exercises.find((e) => e.id === 'suitcase-carry')
      expect(carry).toMatchObject({ loadStepKg: 1.25, scheme: { minSec: 40, maxSec: 65, stepSec: 5, setsPerSide: 2 } })
    })
  })

  it('keeps the target read-only while a workout is in progress', async () => {
    await startWorkout()
    renderSettings('/settings/exercises/db-row')
    expect(await screen.findByRole('button', { name: 'Edit target' })).toBeDisabled()
    expect(screen.getByText('Finish the workout in progress to change it.')).toBeInTheDocument()
    expect(useWorkoutStore.getState().session).not.toBeNull()
  })
})

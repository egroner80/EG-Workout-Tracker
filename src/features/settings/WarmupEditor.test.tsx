import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTemplate } from '../../data/repositories/templateRepo'
import { useWorkoutStore } from '../../state/workoutStore'
import { completeWorkout, renderAt, resetApp, startWorkout } from '../../test/workoutHarness'
import { SettingsScreen } from './SettingsScreen'

const renderEditor = () => renderAt(<SettingsScreen />, '/settings/warmup', '/settings/*')
const card = (name: string) => screen.getByRole('article', { name })

beforeEach(async () => {
  await resetApp()
})

describe('warm-up editor', () => {
  it('renames, retimes, reorders, adds, and removes steps for the next workout only', async () => {
    const user = userEvent.setup({ delay: null })
    const active = await startWorkout()
    renderEditor()
    await screen.findByRole('article', { name: 'Shoulder CARs' })

    await user.click(screen.getByRole('button', { name: 'Rename Shoulder CARs' }))
    const name = screen.getByRole('textbox', { name: 'Warm-up exercise name' })
    await user.clear(name)
    await user.type(name, 'Arm circles{Enter}')
    await screen.findByRole('article', { name: 'Arm circles' })

    await user.click(within(card('Arm circles')).getByRole('button', { name: 'Increase Arm circles duration' }))
    await vi.waitFor(() => expect(within(card('Arm circles')).getByText('0:50')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Move Thoracic rotations up' }))

    await user.click(screen.getByRole('button', { name: 'Add warm-up exercise' }))
    await user.type(screen.getByPlaceholderText('e.g. Band pull-aparts'), 'Band pull-aparts')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await screen.findByRole('article', { name: 'Band pull-aparts' })

    await user.click(screen.getByRole('button', { name: 'Remove Easy push-ups' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await vi.waitFor(() => expect(screen.queryByRole('article', { name: 'Easy push-ups' })).not.toBeInTheDocument())

    // The workout in progress keeps the warm-up it started with.
    const current = useWorkoutStore.getState().session!
    expect(current.warmup.map((s) => [s.name, s.plannedSec])).toEqual(active.warmup.map((s) => [s.name, s.plannedSec]))

    await useWorkoutStore.getState().discard()
    const next = await startWorkout()
    expect(next.warmup.filter((s) => s.active).map((s) => [s.name, s.plannedSec])).toEqual([
      ['Jump rope', 120],
      ['Thoracic rotations', 45],
      ['Arm circles', 50],
      ['Scapular pull-ups', 45],
      ['Band pull-aparts', 45],
    ])
  }, 15_000)

  it('sets the next jump rope duration after a finished workout', async () => {
    const user = userEvent.setup({ delay: null })
    await completeWorkout()
    renderEditor()
    const rope = await screen.findByRole('article', { name: 'Jump rope' })
    // The rope never ran in that workout, so its target repeats.
    expect(within(rope).getByText('2:00')).toBeInTheDocument()

    await user.click(within(rope).getByRole('button', { name: 'Change next Jump rope duration' }))
    const sheet = await screen.findByRole('dialog', { name: 'Jump rope' })
    for (let i = 0; i < 12; i++) await user.click(within(sheet).getByRole('button', { name: 'Increase duration' }))
    await user.click(within(sheet).getByRole('button', { name: 'Save target' }))
    await vi.waitFor(() => expect(within(card('Jump rope')).getByText('3:00')).toBeInTheDocument())

    const next = await startWorkout()
    expect(next.warmup.find((s) => s.stepId === 'jump-rope')?.plannedSec).toBe(180)
  })

  it('adds double unders to the next warm-up before jump rope reaches 5:00', async () => {
    const user = userEvent.setup({ delay: null })
    renderEditor()
    const du = await screen.findByRole('article', { name: 'Double unders' })
    expect(within(du).getByText('Not unlocked yet')).toBeInTheDocument()

    await user.click(within(du).getByRole('switch', { name: 'In the warm-up' }))
    await vi.waitFor(() => expect(within(card('Double unders')).getByText('0:30')).toBeInTheDocument())
    expect(within(card('Double unders')).getByRole('switch', { name: 'In the warm-up' })).toHaveAttribute('aria-checked', 'true')

    const next = await startWorkout()
    expect(next.warmup.find((s) => s.stepId === 'double-unders')).toMatchObject({ active: true, plannedSec: 30 })
  })

  it('edits the rope increase and cap, and double unders follow the new cap', async () => {
    const user = userEvent.setup({ delay: null })
    renderEditor()
    const rope = await screen.findByRole('article', { name: 'Jump rope' })
    await user.click(within(rope).getByRole('button', { name: 'Increase Jump rope increase per workout' }))
    await user.click(within(rope).getByRole('button', { name: 'Decrease Jump rope maximum' }))

    await vi.waitFor(async () => {
      const warmup = (await getTemplate()).warmup
      expect(warmup.find((s) => s.id === 'jump-rope')?.progression).toEqual({ stepSec: 15, maxSec: 285 })
      expect(warmup.find((s) => s.id === 'double-unders')?.activation?.whenDurationReachesSec).toBe(285)
    })
    await vi.waitFor(() =>
      expect(within(card('Double unders')).getByRole('switch', { name: 'In the warm-up' })).toHaveAccessibleDescription(
        /jump rope reaches 4:45/,
      ),
    )
  })

  it('keeps next targets read-only while a workout is in progress', async () => {
    await startWorkout()
    renderEditor()
    const rope = await screen.findByRole('article', { name: 'Jump rope' })
    expect(within(rope).getByRole('button', { name: 'Change next Jump rope duration' })).toBeDisabled()
    expect(within(card('Double unders')).getByRole('switch', { name: 'In the warm-up' })).toBeDisabled()
    // Plain durations are template edits and stay editable.
    expect(within(card('Shoulder CARs')).getByRole('button', { name: 'Increase Shoulder CARs duration' })).toBeEnabled()
  })
})

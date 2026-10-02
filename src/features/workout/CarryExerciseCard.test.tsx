import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateMeta } from '../../data/repositories/settingsRepo'
import { modifyTemplate } from '../../data/repositories/templateRepo'
import type { CarryExerciseLog, TemplateId } from '../../domain/types'
import { goToExercise, startRest, startStrength } from '../../domain/workout/actions'
import { useWorkoutStore } from '../../state/workoutStore'
import { act, advanceFrames, renderAt, resetApp, startWorkout } from '../../test/workoutHarness'
import { WorkoutRoute } from './WorkoutRoute'

/** The side tile itself (not its ±5 s adjusters). */
const tile = (side: 'Left' | 'Right', set: number) =>
  screen.getByRole('button', { name: new RegExp(`^${side}, set ${set}: .*Tap to start the timer`) })

const carry = () =>
  useWorkoutStore.getState().session?.exercises.find((e) => e.kind === 'carry') as CarryExerciseLog

/** The card's name and planned load, with any qualifier. */
const cardHeader = (name: string) => screen.getByRole('heading', { name }).closest('header')

async function openCarry(templateId: TemplateId = 'upper', exerciseId = 'suitcase-carry') {
  await startWorkout(templateId)
  act(startStrength)
  act((s, ctx) => goToExercise(s, exerciseId, ctx))
  return renderAt(<WorkoutRoute />)
}

const openHold = () => openCarry('lower', 'copenhagen-plank')

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  await resetApp()
  await updateMeta({ soundCheckDone: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('timed suitcase carry', () => {
  it('shows modes, load, the time target, and both sides for each set', async () => {
    await openCarry()
    expect(cardHeader('Suitcase carry')).toHaveTextContent('18 kgone dumbbell')
    expect(screen.getByRole('radio', { name: 'Carry' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('region', { name: "Today's target" })).toHaveTextContent('40 s per side × 2')
    expect(screen.getAllByRole('button', { name: /^(Left|Right), set \d: .*Tap to start the timer/ })).toHaveLength(4)
  })

  it('counts down one side after a get-ready, switches hands, and runs the other side', async () => {
    const user = userEvent.setup()
    await openCarry()
    await user.click(tile('Left', 1))
    expect(screen.getByRole('dialog', { name: 'Left hand · Set 1' })).toBeInTheDocument()
    expect(screen.getByText('Pick up the weight')).toBeInTheDocument()

    advanceFrames(5_250)
    expect(screen.getByRole('timer')).toHaveTextContent('0:40')

    advanceFrames(40_000)
    expect(carry().actual[0]).toMatchObject({ status: 'done', seconds: 40 })
    expect(screen.getByRole('dialog', { name: 'Switch to right hand' })).toBeInTheDocument()

    advanceFrames(5_250)
    expect(screen.getByRole('dialog', { name: 'Right hand · Set 1' })).toBeInTheDocument()
    advanceFrames(40_250)
    expect(carry().actual[1]).toMatchObject({ status: 'done', seconds: 40 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const rest = screen.getByRole('region', { name: 'Rest timer' })
    expect(within(rest).getByRole('button', { name: 'Expand rest timer' })).toBeInTheDocument()
    expect(within(rest).queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
  })

  it('Stop records the elapsed time and flags it below target', async () => {
    const user = userEvent.setup()
    await openCarry()
    await user.click(tile('Left', 1))
    advanceFrames(5_250 + 32_000)
    await user.click(screen.getByRole('button', { name: 'Stop · record time' }))
    expect(carry().actual[0]).toMatchObject({ status: 'done', seconds: 32 })
    expect(screen.getByRole('button', { name: /^Left, set 1: 32 seconds recorded/ })).toBeInTheDocument()
    expect(screen.getByText('of 40 s')).toBeInTheDocument()
  })

  it('cancels during the get-ready without recording, and starting a side cancels rest', async () => {
    const user = userEvent.setup()
    await openCarry()
    act((s, ctx) => startRest(s, 'reverse-crunch', ctx))
    await user.click(tile('Right', 2))
    expect(useWorkoutStore.getState().session?.runtime?.rest).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(carry().actual[3].status).toBe('pending')
  })

  it('adjusts a recorded side by 5 seconds and persists the chosen mode', async () => {
    const user = userEvent.setup()
    await openCarry()
    await user.click(screen.getByRole('button', { name: 'Left, set 1: 5 seconds more' }))
    expect(carry().actual[0]).toMatchObject({ status: 'done', seconds: 45 })
    await user.click(screen.getByRole('radio', { name: 'March' }))
    expect(carry().mode).toBe('march')
  })

  it('names the dumbbell only when the carry uses one', async () => {
    await modifyTemplate(
      'upper',
      (template) => ({
        ...template,
        exercises: template.exercises.map((e) => (e.id === 'suitcase-carry' ? { ...e, loadType: 'weight' } : e)),
      }),
      Date.now(),
    )
    await openCarry()
    expect(cardHeader('Suitcase carry')).not.toHaveTextContent('one dumbbell')
    expect(screen.getByRole('radiogroup', { name: 'Variation' })).toBeInTheDocument()
  })
})

describe('Copenhagen plank (a timed hold)', () => {
  it('shows no variations or dumbbell, only the load and the per-side time target', async () => {
    await openHold()
    expect(cardHeader('Copenhagen plank')).toHaveTextContent(/^Copenhagen plankBW$/)
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByText('one dumbbell')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: "Today's target" })).toHaveTextContent('20 s per side × 2')
    expect(screen.getAllByRole('button', { name: /^(Left|Right), set \d: .*Tap to start the timer/ })).toHaveLength(4)
  })

  it('speaks of sides, not hands or weights, from the get-ready through the switch', async () => {
    const user = userEvent.setup()
    await openHold()
    await user.click(tile('Left', 1))
    let overlay = screen.getByRole('dialog', { name: 'Left side · Set 1' })
    expect(overlay).toHaveTextContent('Get into position')

    advanceFrames(5_250)
    overlay = screen.getByRole('dialog', { name: 'Left side · Set 1' })
    expect(within(overlay).getByRole('timer')).toHaveTextContent('0:20')
    expect(overlay).toHaveTextContent('Copenhagen plank')

    advanceFrames(20_000)
    expect(carry().actual[0]).toMatchObject({ status: 'done', seconds: 20 })
    overlay = screen.getByRole('dialog', { name: 'Switch sides' })
    expect(overlay).toHaveTextContent('Set up on the right side')
    expect(overlay).not.toHaveTextContent(/hand|weight/i)

    advanceFrames(5_250)
    expect(screen.getByRole('dialog', { name: 'Right side · Set 1' })).toBeInTheDocument()
    advanceFrames(20_000)
    expect(carry().actual[1]).toMatchObject({ status: 'done', seconds: 20 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

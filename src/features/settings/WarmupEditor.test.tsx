import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTemplate } from '../../data/repositories/templateRepo'
import { SQUAT_ROUTINE } from '../../domain/sharedWarmup'
import type { TemplateId, WorkoutTemplate } from '../../domain/types'
import { useWorkoutStore } from '../../state/workoutStore'
import { completeWorkout, renderAt, resetApp, startWorkout } from '../../test/workoutHarness'
import { SettingsScreen } from './SettingsScreen'
import { updateTemplate, updateWarmupStep } from './settingsActions'

const renderEditor = (templateId: TemplateId = 'upper') =>
  renderAt(<SettingsScreen />, `/settings/${templateId}/warmup`, '/settings/*')
const card = (name: string) => screen.getByRole('article', { name })
const storedStep = async (templateId: TemplateId, id: string) => (await getTemplate(templateId)).warmup.find((s) => s.id === id)
const stepNames = (template: WorkoutTemplate) => template.warmup.map((s) => s.name)

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
      ...SQUAT_ROUTINE.map((step) => [step.name, step.durationSec]),
      ['Thoracic rotations', 45],
      ['Arm circles', 50],
      ['Scapular pull-ups', 45],
      ['Band pull-aparts', 45],
    ])
    // Upper's own steps stay out of the lower-body warm-up.
    expect(stepNames(await getTemplate('lower'))).not.toContain('Band pull-aparts')
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
      const warmup = (await getTemplate('upper')).warmup
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

describe('warm-up editor for each workout', () => {
  it('opens the lower-body warm-up from Settings and lists its steps in order', async () => {
    const user = userEvent.setup({ delay: null })
    renderAt(<SettingsScreen />, '/settings', '/settings/*')
    await user.click(await screen.findByRole('link', { name: 'Lower body warm-up' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Lower body warm-up' })).toBeInTheDocument()
    await screen.findByRole('article', { name: 'Glute bridges' })
    expect(screen.getAllByRole('article').map((article) => article.getAttribute('aria-label'))).toEqual([
      'Jump rope',
      'Double unders',
      ...SQUAT_ROUTINE.map((s) => s.name),
      'Ankle rocks',
      '90-90 hip switches',
      'Adductor rock-backs',
      'World’s greatest stretch',
      'Bodyweight hip hinges',
      'Bodyweight Bulgarian split squat',
      'Glute bridges',
    ])

    // Rep steps count reps instead of time; per-side steps say so.
    const hinges = card('Bodyweight hip hinges')
    expect(within(hinges).getByRole('group', { name: 'Bodyweight hip hinges reps' })).toHaveTextContent('10')
    expect(within(hinges).queryByRole('group', { name: /duration/ })).not.toBeInTheDocument()
    expect(within(card('Bodyweight Bulgarian split squat')).getByText('Reps per side')).toBeInTheDocument()
    const stretch = card('World’s greatest stretch')
    expect(within(stretch).getByText('Time per side')).toBeInTheDocument()
    expect(within(stretch).getByRole('group', { name: 'World’s greatest stretch duration' })).toHaveTextContent('0:30')
    expect(within(stretch).getByRole('switch', { name: 'Each side' })).toHaveAttribute('aria-checked', 'true')
    // Jump rope grows by itself; it has no sides.
    expect(within(card('Jump rope')).queryByRole('switch', { name: 'Each side' })).not.toBeInTheDocument()
  })

  it('changes hip hinges to 12 reps in the lower-body workout only', async () => {
    const user = userEvent.setup({ delay: null })
    const upperBefore = await getTemplate('upper')
    renderEditor('lower')
    const hinges = await screen.findByRole('article', { name: 'Bodyweight hip hinges' })
    for (let i = 0; i < 2; i++) {
      await user.click(within(hinges).getByRole('button', { name: 'Increase Bodyweight hip hinges reps' }))
    }

    await vi.waitFor(() =>
      expect(within(card('Bodyweight hip hinges')).getByRole('group', { name: 'Bodyweight hip hinges reps' })).toHaveTextContent('12'),
    )
    // The time estimate for warm-up totals keeps the step's pace.
    expect(await storedStep('lower', 'hip-hinges')).toMatchObject({ reps: 12, durationSec: 36 })
    expect(await getTemplate('upper')).toEqual(upperBefore)

    const next = await startWorkout('lower')
    expect(next.warmup.find((s) => s.stepId === 'hip-hinges')).toMatchObject({ reps: 12 })
  })

  it('keeps reps between 1 and 50', async () => {
    await updateWarmupStep('lower', 'hip-hinges', (s) => ({ ...s, reps: 50 }))
    await updateWarmupStep('lower', 'glute-bridges', (s) => ({ ...s, reps: 1 }))
    renderEditor('lower')
    const hinges = await screen.findByRole('article', { name: 'Bodyweight hip hinges' })
    expect(within(hinges).getByRole('button', { name: 'Increase Bodyweight hip hinges reps' })).toBeDisabled()
    expect(within(hinges).getByRole('button', { name: 'Decrease Bodyweight hip hinges reps' })).toBeEnabled()
    expect(within(card('Glute bridges')).getByRole('button', { name: 'Decrease Glute bridges reps' })).toBeDisabled()
  })

  it('changes a step both warm-ups share in both, and says so on the card', async () => {
    const user = userEvent.setup({ delay: null })
    renderEditor('lower')
    const rope = await screen.findByRole('article', { name: 'Jump rope' })
    expect(await within(rope).findByText('Also in the upper-body warm-up')).toBeInTheDocument()
    expect(within(card('Deep squat')).getByText('Also in the upper-body warm-up')).toBeInTheDocument()
    expect(within(card('Ankle rocks')).queryByText(/Also in/)).not.toBeInTheDocument()
    expect(screen.getByText(/Editing a step that's also in the upper-body warm-up changes it there too/)).toBeInTheDocument()

    await user.click(within(rope).getByRole('button', { name: 'Rename Jump rope' }))
    const name = screen.getByRole('textbox', { name: 'Warm-up exercise name' })
    await user.clear(name)
    await user.type(name, 'Skipping{Enter}')
    await screen.findByRole('article', { name: 'Skipping' })
    await vi.waitFor(async () => expect((await storedStep('upper', 'jump-rope'))?.name).toBe('Skipping'))
    expect(await storedStep('upper', 'jump-rope')).toEqual(await storedStep('lower', 'jump-rope'))
  })

  it('notes the upper-body warm-up’s shared steps too', async () => {
    renderEditor()
    expect(await screen.findByRole('heading', { level: 1, name: 'Upper body warm-up' })).toBeInTheDocument()
    const rope = await screen.findByRole('article', { name: 'Jump rope' })
    expect(await within(rope).findByText('Also in the lower-body warm-up')).toBeInTheDocument()
    expect(within(card('Shoulder CARs')).queryByText(/Also in/)).not.toBeInTheDocument()
  })

  it('adds a step counted in reps with a time estimate, to this workout only', async () => {
    const user = userEvent.setup({ delay: null })
    renderEditor('lower')
    await screen.findByRole('article', { name: 'Glute bridges' })
    await user.click(screen.getByRole('button', { name: 'Add warm-up exercise' }))
    const sheet = screen.getByRole('dialog', { name: 'Add warm-up exercise' })
    expect(within(sheet).getByRole('radio', { name: 'Time' })).toHaveAttribute('aria-checked', 'true')
    await user.type(within(sheet).getByPlaceholderText('e.g. Band pull-aparts'), 'Cossack squats')
    await user.click(within(sheet).getByRole('radio', { name: 'Reps' }))
    expect(within(sheet).queryByRole('group', { name: 'new warm-up duration' })).not.toBeInTheDocument()
    for (let i = 0; i < 2; i++) await user.click(within(sheet).getByRole('button', { name: 'Increase new warm-up reps' }))
    await user.click(within(sheet).getByRole('button', { name: 'Add' }))

    const added = await screen.findByRole('article', { name: 'Cossack squats' })
    expect(within(added).getByRole('group', { name: 'Cossack squats reps' })).toHaveTextContent('12')
    expect((await getTemplate('lower')).warmup.at(-1)).toMatchObject({ name: 'Cossack squats', reps: 12, durationSec: 36 })
    expect(stepNames(await getTemplate('upper'))).not.toContain('Cossack squats')
  })

  it('does each side on ankle rocks, and doubles a rep step’s estimate for both sides', async () => {
    const user = userEvent.setup({ delay: null })
    renderEditor('lower')
    const rocks = await screen.findByRole('article', { name: 'Ankle rocks' })
    expect(within(rocks).getByRole('switch', { name: 'Each side' })).toHaveAttribute('aria-checked', 'false')
    await user.click(within(rocks).getByRole('switch', { name: 'Each side' }))
    await vi.waitFor(() => expect(within(card('Ankle rocks')).getByText('Time per side')).toBeInTheDocument())
    // A timed step's duration is already per side.
    expect(await storedStep('lower', 'ankle-rocks')).toMatchObject({ perSide: true, durationSec: 45 })

    await user.click(within(card('Glute bridges')).getByRole('switch', { name: 'Each side' }))
    await vi.waitFor(() => expect(within(card('Glute bridges')).getByText('Reps per side')).toBeInTheDocument())
    expect(await storedStep('lower', 'glute-bridges')).toMatchObject({ perSide: true, reps: 10, durationSec: 80 })

    const next = await startWorkout('lower')
    expect(next.warmup.find((s) => s.stepId === 'ankle-rocks')).toMatchObject({ perSide: true, plannedSec: 45 })

    await user.click(within(card('Glute bridges')).getByRole('switch', { name: 'Each side' }))
    await vi.waitFor(async () => expect(await storedStep('lower', 'glute-bridges')).toMatchObject({ perSide: false, durationSec: 40 }))
  })

  it('notes squat-routine steps that flow on from the one before, and only while they follow it', async () => {
    const user = userEvent.setup({ delay: null })
    renderEditor('lower')
    const pushOuts = await screen.findByRole('article', { name: 'Deep squat · knee push-outs' })
    const flows = 'Flows straight on from the previous squat-routine step'
    expect(within(pushOuts).getByText(flows)).toBeInTheDocument()
    // The slow squats are counted, not timed: they wait for Done like any rep step.
    expect(within(card('Slow bodyweight squats')).queryByText(flows)).not.toBeInTheDocument()
    // The routine's first hold follows the rope, so it starts as usual.
    expect(within(card('Deep squat')).queryByText(flows)).not.toBeInTheDocument()
    expect(within(card('Ankle rocks')).queryByText(flows)).not.toBeInTheDocument()

    // Moved out of the routine, the first hold no longer leads into the push-outs.
    await user.click(within(card('Deep squat')).getByRole('button', { name: 'Move Deep squat up' }))
    await vi.waitFor(() => expect(within(card('Deep squat · knee push-outs')).queryByText(flows)).not.toBeInTheDocument())
    expect(within(card('Deep squat · side to side')).getByText(flows)).toBeInTheDocument()
  })

  it('warns that double unders unlock from jump rope before removing it from one workout', async () => {
    const user = userEvent.setup({ delay: null })
    renderEditor('lower')
    await user.click(await screen.findByRole('button', { name: 'Remove Jump rope' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove Jump rope?' })
    expect(
      within(dialog).getByText(
        'Double unders unlock from this step. Without it here, they unlock only from the jump rope in the upper-body warm-up.',
      ),
    ).toBeInTheDocument()
    expect(
      await within(dialog).findByText("It won't appear in future lower-body warm-ups. The upper-body warm-up and past workouts keep it."),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await vi.waitFor(() => expect(screen.queryByRole('article', { name: 'Jump rope' })).not.toBeInTheDocument())

    expect(await storedStep('lower', 'jump-rope')).toBeUndefined()
    expect(await storedStep('lower', 'double-unders')).toBeDefined()
    expect(await storedStep('upper', 'jump-rope')).toBeDefined()
  })

  it('removes a step nothing unlocks from without a warning', async () => {
    const user = userEvent.setup({ delay: null })
    renderEditor('lower')
    await user.click(await screen.findByRole('button', { name: 'Remove Ankle rocks' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove Ankle rocks?' })
    expect(within(dialog).getByText("It won't appear in future warm-ups. Past workouts keep it.")).toBeInTheDocument()
    expect(within(dialog).queryByText(/unlock from this step/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await storedStep('lower', 'ankle-rocks')).toBeDefined()
  })

  it('moves the other workout’s double unders with a new rope cap when this one removed them', async () => {
    const user = userEvent.setup({ delay: null })
    await updateTemplate('lower', (t) => ({ ...t, warmup: t.warmup.filter((s) => s.id !== 'double-unders') }))
    renderEditor('lower')
    const rope = await screen.findByRole('article', { name: 'Jump rope' })
    await user.click(within(rope).getByRole('button', { name: 'Decrease Jump rope maximum' }))

    await vi.waitFor(async () => {
      expect((await storedStep('upper', 'jump-rope'))?.progression?.maxSec).toBe(285)
      expect((await storedStep('upper', 'double-unders'))?.activation?.whenDurationReachesSec).toBe(285)
    })
    expect(await storedStep('lower', 'double-unders')).toBeUndefined()
  })

  it('sends a path naming no workout back to Settings', async () => {
    renderAt(<SettingsScreen />, '/settings/legs/warmup', '/settings/*')
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/settings$/)
  })
})

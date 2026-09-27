import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTargets } from '../../app/liveData'
import { getTemplate } from '../../data/repositories/templateRepo'
import { getCurrentPrescriptions } from '../../services/queries'
import { renderAt, resetApp, startWorkout } from '../../test/workoutHarness'
import { TargetEditorSheet } from './TargetEditorSheet'

beforeEach(async () => {
  await resetApp()
})

function Editor({ targetId }: { targetId: string }) {
  return <TargetEditorSheet data={useTargets()} targetId={targetId} onClose={() => {}} />
}

async function open(targetId: string) {
  renderAt(<Editor targetId={targetId} />, '/')
  return screen.findByRole('dialog')
}

describe('target editor', () => {
  it('changes the set count on the exercise and in the next target', async () => {
    const user = userEvent.setup()
    await open('pull-ups')
    await user.click(screen.getByRole('button', { name: 'Increase number of sets' }))
    await user.click(screen.getByRole('button', { name: 'Save target' }))
    await vi.waitFor(async () => {
      const pullUps = (await getCurrentPrescriptions()).get('pull-ups')
      expect(pullUps?.prescription).toEqual({ kind: 'reps', loadKg: 0, reps: [5, 5, 5, 5] })
    })
    const template = await getTemplate()
    const pullUps = template.exercises.find((e) => e.id === 'pull-ups')
    expect(pullUps?.kind === 'reps' && pullUps.scheme.sets).toBe(4)
  })

  it('edits the carry time per side', async () => {
    const user = userEvent.setup()
    await open('suitcase-carry')
    await user.click(screen.getByRole('button', { name: 'Increase time per side' }))
    await user.click(screen.getByRole('button', { name: 'Increase time per side' }))
    await user.click(screen.getByRole('button', { name: 'Save target' }))
    await vi.waitFor(async () =>
      expect((await getCurrentPrescriptions()).get('suitcase-carry')?.prescription).toMatchObject({ seconds: 50 }),
    )
  })

  it('edits the jump rope duration', async () => {
    const user = userEvent.setup()
    await open('jump-rope')
    for (let i = 0; i < 6; i++) await user.click(screen.getByRole('button', { name: 'Increase duration' }))
    await user.click(screen.getByRole('button', { name: 'Save target' }))
    await vi.waitFor(async () =>
      expect((await getCurrentPrescriptions()).get('jump-rope')?.prescription).toEqual({
        kind: 'warmup',
        durationSec: 150,
        active: true,
      }),
    )
  })

  it('is read-only while a workout is in progress', async () => {
    await startWorkout()
    await open('db-row')
    expect(screen.getByText(/Finish or discard the workout in progress/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save target' })).toBeDisabled()
  })
})

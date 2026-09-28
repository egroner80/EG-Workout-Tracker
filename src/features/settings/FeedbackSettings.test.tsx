import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSettings } from '../../data/repositories/settingsRepo'
import { feedback } from '../../platform/feedback'
import { useWorkoutStore } from '../../state/workoutStore'
import { renderAt, resetApp } from '../../test/workoutHarness'
import { FeedbackSettings } from './FeedbackSettings'

vi.mock('../../platform/feedback', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/feedback')>()),
  feedback: vi.fn(),
}))

beforeEach(async () => {
  await resetApp()
})

describe('feedback settings', () => {
  it('plays a test cue', async () => {
    const user = userEvent.setup({ delay: null })
    const testSound = vi.fn()
    vi.mocked(feedback).mockReturnValue({ prime: vi.fn(), testSound } as unknown as ReturnType<typeof feedback>)
    renderAt(<FeedbackSettings />, '/settings')
    await user.click(screen.getByRole('button', { name: 'Test sound' }))
    expect(testSound).toHaveBeenCalledOnce()
  })

  it('applies toggles immediately and persists them', async () => {
    const user = userEvent.setup({ delay: null })
    renderAt(<FeedbackSettings />, '/settings')
    const audible = screen.getByRole('switch', { name: 'Always audible' })
    expect(audible).toHaveAttribute('aria-checked', 'false')
    await user.click(audible)
    expect(useWorkoutStore.getState().settings.alwaysAudible).toBe(true)
    expect(audible).toHaveAttribute('aria-checked', 'true')

    await user.click(screen.getByRole('switch', { name: '3-second get-ready' }))
    await user.click(screen.getByRole('radio', { name: 'Light' }))
    await vi.waitFor(async () =>
      expect(await getSettings()).toMatchObject({ alwaysAudible: true, getReadyCountdown: false, theme: 'light' }),
    )
  })

  it('disables "Always audible" when sound is off', async () => {
    const user = userEvent.setup({ delay: null })
    renderAt(<FeedbackSettings />, '/settings')
    await user.click(screen.getByRole('switch', { name: 'Sound cues' }))
    expect(screen.getByRole('switch', { name: 'Always audible' })).toBeDisabled()
  })
})

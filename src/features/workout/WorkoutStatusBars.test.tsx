import { renderHook, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDeviceState } from '../../platform/feedback'
import { useWorkoutStore } from '../../state/workoutStore'
import { resetApp } from '../../test/workoutHarness'
import { WorkoutStatusBars } from './WorkoutStatusBars'
import { useStatusBar } from './useStatusBar'

beforeEach(async () => {
  await resetApp()
  useDeviceState.setState({ needsTapForWakeLock: false })
})

describe('workout status bars', () => {
  it('shows one bar at a time, with "Not saved" outranking the keep-awake prompt', () => {
    useDeviceState.setState({ needsTapForWakeLock: true })
    expect(renderHook(() => useStatusBar()).result.current).toBe('wake-lock')

    useWorkoutStore.setState({ saveError: 'IndexedDB unavailable' })
    expect(renderHook(() => useStatusBar()).result.current).toBe('not-saved')
  })

  it('hides the keep-awake prompt when keeping the screen on is turned off', () => {
    useDeviceState.setState({ needsTapForWakeLock: true })
    useWorkoutStore.setState((state) => ({ settings: { ...state.settings, keepScreenAwake: false } }))
    expect(renderHook(() => useStatusBar()).result.current).toBeNull()
  })

  it('renders the prompts', () => {
    const { rerender } = render(<WorkoutStatusBars kind="wake-lock" />)
    expect(screen.getByRole('status')).toHaveTextContent('Tap anywhere to keep the screen on')
    rerender(<WorkoutStatusBars kind="not-saved" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Not saved yet')
  })
})

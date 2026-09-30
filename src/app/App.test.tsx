import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, templateKey } from '../data/db'
import { createTemplate } from '../data/seed/defaultTemplate'
import { buildSession, finishSession } from '../domain/session'
import type { WorkoutSession, WorkoutTemplate } from '../domain/types'
import { resetApp } from '../test/workoutHarness'
import { App } from './App'

describe('App shell', () => {
  beforeEach(async () => {
    window.location.hash = ''
    await resetApp()
  })

  it('boots into Today with the tab bar and a START button', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Start upper body' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('navigates between tabs and marks the active tab', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('button', { name: 'Start upper body' })

    await user.click(screen.getByRole('link', { name: 'History' }))
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('link', { name: 'Progress' }))
    expect(screen.getByRole('link', { name: 'Progress' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('link', { name: 'Settings' }))
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
  })

  it('hides the tab bar on the workout route', async () => {
    window.location.hash = '#/workout'
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'No workout in progress' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it('reads an unreadable stored workout as its seed instead of crashing', async () => {
    const broken = { ...createTemplate('upper'), exercises: [{ id: 'x', kind: 'reps', name: 'X' }] }
    await db.kv.put({ key: templateKey('upper'), value: broken as unknown as WorkoutTemplate })
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Start upper body' })).toBeInTheDocument()
    // The next-workout list loads on its own and can land just after Start.
    expect(await screen.findByText('Pull-ups')).toBeInTheDocument()
  })

  it('keeps the tab bar and a way to Settings when a screen fails to render', async () => {
    const workout = finishSession(
      buildSession({ id: 'odd', now: Date.now() - 3_600_000, template: createTemplate('upper'), prescriptions: new Map() }),
      { now: Date.now() - 60_000 },
    )
    await db.sessions.put({ ...workout, exercises: 'unreadable' } as unknown as WorkoutSession)
    window.location.hash = '#/history'
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'This screen couldn’t be shown' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Settings' })).toBeInTheDocument()
  })
})

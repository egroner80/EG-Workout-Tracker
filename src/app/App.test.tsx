import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, templateKey } from '../data/db'
import { createTemplate } from '../data/seed/defaultTemplate'
import type { WorkoutTemplate } from '../domain/types'
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

  it('keeps the tab bar and a way to Settings when a screen fails to render', async () => {
    const broken = { ...createTemplate('upper'), exercises: [{ id: 'x', kind: 'reps', name: 'X' }] }
    await db.kv.put({ key: templateKey('upper'), value: broken as unknown as WorkoutTemplate })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'This screen couldn’t be shown' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Settings' })).toBeInTheDocument()
  })
})

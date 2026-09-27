import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetApp } from '../test/workoutHarness'
import { App } from './App'

describe('App shell', () => {
  beforeEach(async () => {
    window.location.hash = ''
    await resetApp()
  })

  it('boots into Today with the tab bar and a START button', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('navigates between tabs and marks the active tab', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('button', { name: 'Start workout' })

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
})

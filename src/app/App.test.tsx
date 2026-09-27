import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'

describe('App shell', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('renders the Today route inside the shell with the tab bar', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('navigates between tabs and marks the active tab', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: 'Today' })

    await user.click(screen.getByRole('link', { name: 'History' }))
    expect(await screen.findByRole('heading', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('link', { name: 'Progress' }))
    expect(await screen.findByRole('heading', { name: 'Progress' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })

  it('hides the tab bar on the workout route', async () => {
    window.location.hash = '#/workout'
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Workout' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })
})

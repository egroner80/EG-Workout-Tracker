import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { modifyTemplate } from '../../data/repositories/templateRepo'
import { renderAt, resetApp } from '../../test/workoutHarness'
import { ExerciseProgressScreen } from './ExerciseProgressScreen'
import { ProgressScreen } from './ProgressScreen'

describe('Progress list', () => {
  beforeEach(async () => {
    await resetApp()
  })

  it('groups exercises by workout, upper body first, and shows the jump rope once', async () => {
    renderAt(<ProgressScreen />, '/progress')

    const upper = await screen.findByRole('region', { name: 'Upper body' })
    expect(within(upper).getByRole('link', { name: /^Pull-ups/ })).toHaveTextContent('Pull-upsBW · 5 / 5 / 5')
    expect(within(upper).queryByRole('link', { name: /^Copenhagen plank/ })).not.toBeInTheDocument()

    const lower = screen.getByRole('region', { name: 'Lower body' })
    const plank = within(lower).getByRole('link', { name: /^Copenhagen plank/ })
    expect(plank).toHaveTextContent('Copenhagen plankBW · 20 s per side × 2')
    expect(plank).toHaveAttribute('href', '/progress/copenhagen-plank')

    expect(screen.getAllByRole('link', { name: /^Jump rope/ })).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'Warm-up' })).toHaveTextContent('Jump rope2:00')
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Upper body',
      'Lower body',
      'Warm-up',
    ])
  })

  it('keeps the jump rope when only the lower warm-up has it', async () => {
    await modifyTemplate('upper', (t) => ({ ...t, warmup: t.warmup.filter((s) => s.id !== 'jump-rope') }), Date.now())
    renderAt(<ProgressScreen />, '/progress')
    expect(await screen.findByRole('link', { name: /^Jump rope/ })).toHaveAttribute('href', '/progress/jump-rope')
  })
})

describe('Progress page for one target', () => {
  beforeEach(async () => {
    await resetApp({ demo: true })
  })

  it('opens the Copenhagen plank of the lower-body workout as a hold', async () => {
    renderAt(<ExerciseProgressScreen />, '/progress/copenhagen-plank', '/progress/:targetId')
    expect(await screen.findByRole('heading', { name: 'Copenhagen plank' })).toBeInTheDocument()
    expect(screen.getByText('Lower body')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Progression ladder' })).toHaveTextContent('20 s')
    expect(screen.getByText('Seconds held per workout')).toBeInTheDocument()
  })

  it('says so for an id neither workout has', async () => {
    renderAt(<ExerciseProgressScreen />, '/progress/leg-press', '/progress/:targetId')
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument()
  })
})

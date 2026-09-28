import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderAt, resetApp } from '../../test/workoutHarness'
import { ExerciseProgressScreen } from './ExerciseProgressScreen'
import { LadderView } from './LadderView'

describe('LadderView', () => {
  it('shows each load with its rungs, attempts, completion, and the increase', () => {
    render(
      <LadderView
        loadType="dumbbell"
        groups={[
          {
            loadKg: 18,
            startDate: Date.UTC(2026, 7, 1),
            increased: false,
            rungs: [
              { label: '5/5/5', attempts: 1, completed: true, firstDate: 0 },
              { label: '5/6/6', attempts: 2, completed: true, firstDate: 0 },
            ],
          },
          {
            loadKg: 20,
            startDate: Date.UTC(2026, 8, 2),
            increased: true,
            rungs: [{ label: '5/5/5', attempts: 1, completed: false, firstDate: 0 }],
          },
        ]}
      />,
    )
    expect(screen.getByText('18 kg')).toBeInTheDocument()
    expect(screen.getByText(/2 tries/)).toBeInTheDocument()
    expect(screen.getByText(/↑ from 2 Sept?/)).toBeInTheDocument()
    expect(screen.getByText('working on it')).toBeInTheDocument()
  })

  it('explains the empty state', () => {
    render(<LadderView loadType="dumbbell" groups={[]} />)
    expect(screen.getByText(/starts with the first logged workout/)).toBeInTheDocument()
  })
})

describe('ExerciseProgressScreen with demo history', () => {
  beforeEach(async () => {
    await resetApp({ demo: true })
  })

  it('renders the ladder, both charts, and the log for a main lift', async () => {
    renderAt(<ExerciseProgressScreen />, '/progress/db-row', '/progress/:targetId')
    expect(await screen.findByRole('heading', { name: 'One-arm DB row' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Progression ladder' })).toBeInTheDocument()
    expect(screen.getByText('Weight (one dumbbell)')).toBeInTheDocument()
    expect(screen.getByText('Total reps per workout')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /Weight \(one dumbbell\): 14 kg/ })).toHaveLength(1)
    expect(screen.getAllByText('demo').length).toBeGreaterThan(10)
  })

  it('charts jump rope duration', async () => {
    renderAt(<ExerciseProgressScreen />, '/progress/jump-rope', '/progress/:targetId')
    expect(await screen.findByText('Duration per workout')).toBeInTheDocument()
  })
})

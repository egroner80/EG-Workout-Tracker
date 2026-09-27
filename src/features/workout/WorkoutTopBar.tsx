import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { Sheet } from '../../components/Sheet'
import { IconChevronLeft, IconChevronRight, IconMore } from '../../components/icons'
import type { ExerciseLog, WorkoutSession } from '../../domain/types'
import { goToExercise } from '../../domain/workout/actions'
import { useWorkoutStore } from '../../state/workoutStore'
import { exerciseProgress } from './cardUtils'
import styles from './WorkoutTopBar.module.css'

function dotClass(log: ExerciseLog, current: boolean): string {
  if (current) return styles.current
  const { logged, total } = exerciseProgress(log)
  if (logged === total) return styles.complete
  return logged > 0 ? styles.partial : ''
}

interface WorkoutTopBarProps {
  session: WorkoutSession
  index: number
  onFinish: () => void
  onDiscard: () => void
}

export function WorkoutTopBar({ session, index, onFinish, onDiscard }: WorkoutTopBarProps) {
  const navigate = useNavigate()
  const apply = useWorkoutStore((state) => state.apply)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const exercises = session.exercises
  const go = (target: number) => {
    const exercise = exercises[target]
    if (exercise) apply((s, ctx) => goToExercise(s, exercise.exerciseId, ctx))
  }
  const reopened = Boolean(session.reopenSnapshot)

  return (
    <header className={styles.bar}>
      <button
        type="button"
        className={styles.navButton}
        onClick={() => go(index - 1)}
        disabled={index === 0}
        aria-label="Previous exercise"
      >
        <IconChevronLeft size={28} />
      </button>

      <button type="button" className={styles.position} onClick={() => setJumpOpen(true)} aria-label="Jump to exercise">
        <span className={styles.count}>
          {index + 1} / {exercises.length}
        </span>
        <span className={styles.dots} aria-hidden="true">
          {exercises.map((log, i) => {
            return <span key={log.exerciseId} className={`${styles.dot} ${dotClass(log, i === index)}`} />
          })}
        </span>
      </button>

      <button
        type="button"
        className={styles.navButton}
        onClick={() => go(index + 1)}
        disabled={index === exercises.length - 1}
        aria-label="Next exercise"
      >
        <IconChevronRight size={28} />
      </button>

      <button type="button" className={styles.navButton} onClick={() => setMenuOpen(true)} aria-label="Workout menu">
        <IconMore size={26} />
      </button>

      <Sheet open={jumpOpen} title="Exercises" onClose={() => setJumpOpen(false)}>
        <ul className={styles.jumpList}>
          {exercises.map((log, i) => {
            const { logged, total } = exerciseProgress(log)
            return (
              <li key={log.exerciseId}>
                <button
                  type="button"
                  className={`${styles.jumpRow} ${i === index ? styles.jumpCurrent : ''}`}
                  onClick={() => {
                    go(i)
                    setJumpOpen(false)
                  }}
                >
                  <span>{log.name}</span>
                  <span className={styles.jumpMeta}>
                    {logged}/{total}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Sheet>

      <Sheet
        open={menuOpen}
        title="Workout"
        onClose={() => setMenuOpen(false)}
        footer={
          <>
            <Button
              variant="primary"
              block
              onClick={() => {
                setMenuOpen(false)
                onFinish()
              }}
            >
              Finish workout
            </Button>
            <Button block onClick={() => navigate('/')}>
              Go to Today (keeps the workout open)
            </Button>
            <Button
              variant={reopened ? 'secondary' : 'danger'}
              block
              onClick={() => {
                setMenuOpen(false)
                onDiscard()
              }}
            >
              {reopened ? 'Cancel edits' : 'Discard workout'}
            </Button>
          </>
        }
      />
    </header>
  )
}

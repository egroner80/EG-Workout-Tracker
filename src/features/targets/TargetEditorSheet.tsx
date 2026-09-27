import { useState } from 'react'
import type { TargetsData } from '../../app/liveData'
import { Button } from '../../components/Button'
import { Sheet } from '../../components/Sheet'
import { Stepper } from '../../components/Stepper'
import { modifyTemplate } from '../../data/repositories/templateRepo'
import { formatDuration, formatLoad, formatReps } from '../../domain/format'
import { stepLoad } from '../../domain/load'
import { clamp } from '../../domain/math'
import type { ResolvedPrescription } from '../../domain/prescription'
import { bottomRung, buildLadder, rungIndex } from '../../domain/progression/staircase'
import type { ExerciseDef, Prescription, WarmupStepDef } from '../../domain/types'
import { createOverride } from '../../services/dataCommands'
import { useWorkoutStore } from '../../state/workoutStore'
import styles from './TargetEditorSheet.module.css'

interface TargetEditorSheetProps {
  /** The screen's own `useTargets()` result, so the sheet adds no second query. */
  data: TargetsData | undefined
  targetId: string | null
  onClose: () => void
}

/** Edits the next workout's target for one exercise or progressive warm-up step. */
export function TargetEditorSheet({ data, targetId, onClose }: TargetEditorSheetProps) {
  if (!targetId || !data) return null
  const exercise = data.template.exercises.find((e) => e.id === targetId)
  const step = data.template.warmup.find((s) => s.id === targetId)
  const resolved = data.targets.get(targetId)
  if ((!exercise && !step) || !resolved) return null
  return (
    <EditorBody
      key={targetId}
      exercise={exercise}
      step={step}
      resolved={resolved}
      onClose={onClose}
    />
  )
}

interface EditorBodyProps {
  exercise?: ExerciseDef
  step?: WarmupStepDef
  resolved: ResolvedPrescription
  onClose: () => void
}

function EditorBody({ exercise, step, resolved, onClose }: EditorBodyProps) {
  const workoutActive = useWorkoutStore((state) => state.session !== null)
  const [draft, setDraft] = useState<Prescription>(() => structuredClone(resolved.prescription))
  const [error, setError] = useState<string | null>(null)
  const title = exercise?.name ?? step?.name ?? 'Target'

  const save = async () => {
    setError(null)
    try {
      if (exercise?.kind === 'reps' && draft.kind === 'reps' && draft.reps.length !== exercise.scheme.sets) {
        // The number of sets belongs to the exercise, so it changes there too.
        const sets = draft.reps.length
        await modifyTemplate(
          (t) => ({
            ...t,
            exercises: t.exercises.map((e) =>
              e.id === exercise.id && e.kind === 'reps' ? { ...e, scheme: { ...e.scheme, sets } } : e,
            ),
          }),
          Date.now(),
        )
      }
      await createOverride(exercise?.id ?? step!.id, draft, Date.now())
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the target')
    }
  }

  return (
    <Sheet
      open
      title={title}
      description={workoutActive ? 'Finish or discard the workout in progress to change next targets.' : 'Next workout'}
      onClose={onClose}
      footer={
        <>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <Button variant="primary" size="lg" block disabled={workoutActive} onClick={() => void save()}>
            Save target
          </Button>
          <Button block onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        {draft.kind === 'reps' && exercise?.kind === 'reps' && <RepsEditor exercise={exercise} draft={draft} onChange={setDraft} />}
        {draft.kind === 'timed' && exercise && (
          <>
            <LoadField exercise={exercise} loadKg={draft.loadKg} onChange={(loadKg) => setDraft({ ...draft, loadKg })} />
            <Field label="Time per side">
              <Stepper
                label="time per side"
                value={`${draft.seconds} s`}
                canDecrement={draft.seconds > 5}
                onDecrement={() => setDraft({ ...draft, seconds: Math.max(5, draft.seconds - 5) })}
                onIncrement={() => setDraft({ ...draft, seconds: Math.min(600, draft.seconds + 5) })}
              />
            </Field>
          </>
        )}
        {draft.kind === 'warmup' && (
          <Field label="Duration">
            <Stepper
              label="duration"
              value={formatDuration(draft.durationSec)}
              canDecrement={draft.durationSec > 5}
              onDecrement={() => setDraft({ ...draft, durationSec: Math.max(5, draft.durationSec - 5), active: true })}
              onIncrement={() => setDraft({ ...draft, durationSec: Math.min(1800, draft.durationSec + 5), active: true })}
            />
          </Field>
        )}
      </div>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  )
}

function LoadField({ exercise, loadKg, onChange }: { exercise: ExerciseDef; loadKg: number; onChange: (kg: number) => void }) {
  return (
    <Field label={exercise.loadType === 'dumbbell' ? 'Weight (one dumbbell)' : 'Weight'}>
      <Stepper
        label="weight"
        value={formatLoad(exercise.loadType, loadKg)}
        onDecrement={() => onChange(stepLoad(exercise.loadType, loadKg, exercise.loadStepKg, -1))}
        onIncrement={() => onChange(stepLoad(exercise.loadType, loadKg, exercise.loadStepKg, 1))}
      />
    </Field>
  )
}

function RepsEditor({
  exercise,
  draft,
  onChange,
}: {
  exercise: Extract<ExerciseDef, { kind: 'reps' }>
  draft: Extract<Prescription, { kind: 'reps' }>
  onChange: (next: Prescription) => void
}) {
  const { minReps, maxReps } = exercise.scheme
  const ladder = buildLadder(draft.reps.length, minReps, maxReps)
  const current = rungIndex(draft.reps, ladder)
  const setCount = (count: number) => {
    const next = count > draft.reps.length ? [...draft.reps, ...bottomRung(count - draft.reps.length, minReps)] : draft.reps.slice(0, count)
    onChange({ ...draft, reps: next })
  }
  const setReps = (index: number, delta: number) =>
    onChange({ ...draft, reps: draft.reps.map((r, i) => (i === index ? clamp(r + delta, 1, 99) : r)) })

  return (
    <>
      <LoadField exercise={exercise} loadKg={draft.loadKg} onChange={(loadKg) => onChange({ ...draft, loadKg })} />
      <Field label="Stage">
        <div className={styles.ladder} role="radiogroup" aria-label="Stage">
          {ladder.map((rung, index) => (
            <button
              key={rung.join('-')}
              type="button"
              role="radio"
              aria-checked={index === current}
              className={`${styles.rung} ${index === current ? styles.rungSelected : ''}`}
              onClick={() => onChange({ ...draft, reps: [...rung] })}
            >
              {formatReps(rung, ' / ')}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Reps per set">
        <div className={styles.sets}>
          {draft.reps.map((reps, index) => (
            <Stepper
              key={index}
              size="md"
              orientation="vertical"
              label={`set ${index + 1} reps`}
              value={reps}
              canDecrement={reps > 1}
              onDecrement={() => setReps(index, -1)}
              onIncrement={() => setReps(index, 1)}
            />
          ))}
        </div>
      </Field>
      <Field label="Sets">
        <Stepper
          label="number of sets"
          value={draft.reps.length}
          canDecrement={draft.reps.length > 1}
          canIncrement={draft.reps.length < 8}
          onDecrement={() => setCount(draft.reps.length - 1)}
          onIncrement={() => setCount(draft.reps.length + 1)}
        />
      </Field>
    </>
  )
}

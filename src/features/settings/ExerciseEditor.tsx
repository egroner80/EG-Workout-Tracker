import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTargets, type TargetsData } from '../../app/liveData'
import { Button } from '../../components/Button'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Stepper } from '../../components/Stepper'
import { Toggle } from '../../components/Toggle'
import { newId } from '../../data/ids'
import { formatDuration, formatKg, formatLoad, formatPrescription } from '../../domain/format'
import { stepLoad } from '../../domain/load'
import { clamp } from '../../domain/math'
import type { ResolvedPrescription } from '../../domain/prescription'
import { bottomRung } from '../../domain/progression/staircase'
import type { CarryExerciseDef, ExerciseDef, LoadType, RepsExerciseDef, TemplateId } from '../../domain/types'
import { MAX_REST_SEC, MIN_REST_SEC } from '../../domain/workout/actions'
import { templateLabel } from '../../domain/workouts'
import { useWorkoutStore } from '../../state/workoutStore'
import { TargetEditorSheet } from '../targets/TargetEditorSheet'
import { NameField } from './NameField'
import styles from './Settings.module.css'
import { Field, SegmentedControl } from './SettingsControls'
import { updateExercise, updateTemplate } from './settingsActions'
import { useTemplateParam } from './useTemplateParam'

const LOAD_TYPES: { value: LoadType; label: string }[] = [
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'weight', label: 'Weight' },
  { value: 'bodyweight', label: 'Bodyweight' },
]
const LOAD_STEPS = [0.5, 1, 1.25, 2, 2.5, 5]
const DEFAULT_STEP: Record<LoadType, number> = { dumbbell: 2, weight: 2.5, bodyweight: 2.5 }
const SOURCE_TEXT: Record<ResolvedPrescription['source'], string> = {
  recommendation: 'Suggested from your last workout.',
  override: 'Set by you.',
  baseline: 'Starting point.',
}

/** Where an exercise screen goes back to: its workout's exercise list. */
function exerciseList(templateId: TemplateId) {
  return { path: `/settings/${templateId}/exercises`, label: `${templateLabel(templateId)} exercises` }
}

export function ExerciseEditor() {
  const templateId = useTemplateParam()
  const { exerciseId } = useParams()
  const data = useTargets(templateId)
  if (exerciseId === 'new') return <NewExerciseForm />
  if (!data) return <div className={styles.loading} aria-busy="true" />
  const exercise = data.template.exercises.find((e) => e.id === exerciseId)
  if (!exercise) {
    const list = exerciseList(templateId)
    return (
      <div className={styles.screen}>
        <ScreenHeader title="Exercise" backTo={list.path} backLabel={list.label} />
        <p className={styles.note}>This exercise is no longer in your workout. Its past workouts are still in History.</p>
      </div>
    )
  }
  return <EditExercise key={exercise.id} exercise={exercise} data={data} />
}

function EditExercise({ exercise, data }: { exercise: ExerciseDef; data: TargetsData }) {
  const templateId = useTemplateParam()
  const list = exerciseList(templateId)
  const resolved = data.targets.get(exercise.id)
  const isOnlyExercise = data.template.exercises.length === 1
  const navigate = useNavigate()
  const workoutActive = useWorkoutStore((state) => state.session !== null)
  const [editingTarget, setEditingTarget] = useState(false)
  const [removing, setRemoving] = useState(false)
  const update = (recipe: (e: ExerciseDef) => ExerciseDef) => void updateExercise(templateId, exercise.id, recipe)

  return (
    <div className={styles.screen}>
      <ScreenHeader title={exercise.name} backTo={list.path} backLabel={list.label} />

      <section className={styles.section} aria-labelledby="exercise-next">
        <h2 id="exercise-next" className={styles.sectionTitle}>
          Next workout
        </h2>
        <div className={styles.group}>
          <div className={styles.fieldRow}>
            <p className={styles.fieldText}>
              <span className={styles.value}>
                {resolved ? formatPrescription(resolved.prescription, exercise.loadType) : '—'}
              </span>
              <span className={styles.rowHint}>
                {workoutActive
                  ? 'Finish the workout in progress to change it.'
                  : resolved
                    ? SOURCE_TEXT[resolved.source]
                    : ''}
              </span>
            </p>
            <Button size="md" disabled={workoutActive} onClick={() => setEditingTarget(true)}>
              Edit target
            </Button>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="exercise-basics">
        <h2 id="exercise-basics" className={styles.sectionTitle}>
          Exercise
        </h2>
        <div className={styles.group}>
          <div className={styles.stackRow}>
            <span className={styles.rowLabel}>Name</span>
            <NameField name={exercise.name} label="Exercise name" onSave={(name) => update((e) => ({ ...e, name }))} />
          </div>
          <div className={styles.stackRow}>
            <span className={styles.rowLabel}>Short name</span>
            <span className={styles.rowHint}>Used in lists and the summary.</span>
            <NameField
              name={exercise.shortName}
              label="Short name"
              onSave={(shortName) => update((e) => ({ ...e, shortName }))}
            />
          </div>
          <Field label="Load" stacked>
            <SegmentedControl
              label="Load type"
              value={exercise.loadType}
              options={LOAD_TYPES}
              onChange={(loadType) => update((e) => withLoadType(e, loadType))}
            />
          </Field>
          <Field label="Weight step">
            <Stepper
              size="md"
              label="weight step"
              value={`${formatKg(exercise.loadStepKg)} kg`}
              canDecrement={exercise.loadStepKg > LOAD_STEPS[0]}
              canIncrement={exercise.loadStepKg < LOAD_STEPS[LOAD_STEPS.length - 1]}
              onDecrement={() => update((e) => ({ ...e, loadStepKg: nextStep(e.loadStepKg, -1) }))}
              onIncrement={() => update((e) => ({ ...e, loadStepKg: nextStep(e.loadStepKg, 1) }))}
            />
          </Field>
          {exercise.kind === 'reps' && (
            <Toggle
              label="Counted per side"
              description="Reps are for each arm, like the one-arm row."
              checked={exercise.perSide}
              onChange={(perSide) => update((e) => ({ ...e, perSide }))}
            />
          )}
        </div>
      </section>

      {exercise.kind === 'reps' ? (
        <RepsSchemeFields exercise={exercise} update={update} />
      ) : (
        <CarrySchemeFields exercise={exercise} update={update} />
      )}

      <section className={styles.section} aria-labelledby="exercise-rest">
        <h2 id="exercise-rest" className={styles.sectionTitle}>
          Rest
        </h2>
        <div className={styles.group}>
          <Field label="Rest after each set">
            <Stepper
              size="md"
              label="rest time"
              value={formatDuration(exercise.restSec)}
              canDecrement={exercise.restSec > MIN_REST_SEC}
              canIncrement={exercise.restSec < MAX_REST_SEC}
              onDecrement={() => update((e) => ({ ...e, restSec: clamp(e.restSec - 15, MIN_REST_SEC, MAX_REST_SEC) }))}
              onIncrement={() => update((e) => ({ ...e, restSec: clamp(e.restSec + 15, MIN_REST_SEC, MAX_REST_SEC) }))}
            />
          </Field>
        </div>
      </section>

      <Button variant="danger" block disabled={isOnlyExercise} onClick={() => setRemoving(true)}>
        Remove from workout
      </Button>
      {isOnlyExercise && <p className={styles.note}>A workout needs at least one exercise.</p>}

      <TargetEditorSheet data={data} targetId={editingTarget ? exercise.id : null} onClose={() => setEditingTarget(false)} />
      <ConfirmSheet
        open={removing}
        title={`Remove ${exercise.name}?`}
        description="It won't be in future workouts. Past workouts keep it in History."
        confirmLabel="Remove"
        onConfirm={() => {
          setRemoving(false)
          void updateTemplate(templateId, (t) => ({ ...t, exercises: t.exercises.filter((e) => e.id !== exercise.id) })).then(() =>
            navigate(list.path, { replace: true }),
          )
        }}
        onClose={() => setRemoving(false)}
      />
    </div>
  )
}

type Update = (recipe: (e: ExerciseDef) => ExerciseDef) => void

/** Scheme edits restart the starting point at the bottom rung so it stays in range. */
function withRepsScheme(e: ExerciseDef, patch: Partial<RepsExerciseDef['scheme']>): ExerciseDef {
  if (e.kind !== 'reps') return e
  const scheme = { ...e.scheme, ...patch }
  scheme.minReps = clamp(scheme.minReps, 1, 50)
  scheme.maxReps = clamp(scheme.maxReps, scheme.minReps, 50)
  scheme.sets = clamp(scheme.sets, 1, 8)
  return { ...e, scheme, baseline: { ...e.baseline, reps: bottomRung(scheme.sets, scheme.minReps) } }
}

function withCarryScheme(e: ExerciseDef, patch: Partial<CarryExerciseDef['scheme']>): ExerciseDef {
  if (e.kind !== 'carry') return e
  const scheme = { ...e.scheme, ...patch }
  scheme.setsPerSide = clamp(scheme.setsPerSide, 1, 4)
  scheme.minSec = clamp(scheme.minSec, 5, 600)
  scheme.maxSec = clamp(scheme.maxSec, scheme.minSec, 600)
  scheme.stepSec = clamp(scheme.stepSec, 5, 60)
  return {
    ...e,
    scheme,
    baseline: {
      ...e.baseline,
      setsPerSide: scheme.setsPerSide,
      seconds: clamp(e.baseline.seconds, scheme.minSec, scheme.maxSec),
    },
  }
}

function withLoadType(e: ExerciseDef, loadType: LoadType): ExerciseDef {
  if (e.loadType === loadType) return e
  // External loads never go below one step; bodyweight starts at plain bodyweight.
  const loadKg = loadType === 'bodyweight' ? 0 : Math.max(e.loadStepKg, e.baseline.loadKg)
  if (e.kind === 'reps') return { ...e, loadType, baseline: { ...e.baseline, loadKg } }
  return { ...e, loadType, baseline: { ...e.baseline, loadKg } }
}

function nextStep(current: number, direction: -1 | 1): number {
  const index = LOAD_STEPS.findIndex((step) => step >= current)
  const at = index === -1 ? LOAD_STEPS.length - 1 : index
  const exact = LOAD_STEPS[at] === current
  const target = direction === 1 ? (exact ? at + 1 : at) : at - 1
  return LOAD_STEPS[clamp(target, 0, LOAD_STEPS.length - 1)]
}

function RepsSchemeFields({ exercise, update }: { exercise: RepsExerciseDef; update: Update }) {
  const { sets, minReps, maxReps } = exercise.scheme
  const change = (patch: (s: RepsExerciseDef['scheme']) => Partial<RepsExerciseDef['scheme']>) =>
    update((e) => (e.kind === 'reps' ? withRepsScheme(e, patch(e.scheme)) : e))
  return (
    <section className={styles.section} aria-labelledby="exercise-scheme">
      <h2 id="exercise-scheme" className={styles.sectionTitle}>
        Sets and reps
      </h2>
      <div className={styles.group}>
        <Field label="Sets">
          <Stepper
            size="md"
            label="sets"
            value={sets}
            canDecrement={sets > 1}
            canIncrement={sets < 8}
            onDecrement={() => change((s) => ({ sets: s.sets - 1 }))}
            onIncrement={() => change((s) => ({ sets: s.sets + 1 }))}
          />
        </Field>
        <Field label="Fewest reps">
          <Stepper
            size="md"
            label="fewest reps"
            value={minReps}
            canDecrement={minReps > 1}
            canIncrement={minReps < maxReps}
            onDecrement={() => change((s) => ({ minReps: s.minReps - 1 }))}
            onIncrement={() => change((s) => ({ minReps: Math.min(s.maxReps, s.minReps + 1) }))}
          />
        </Field>
        <Field label="Most reps">
          <Stepper
            size="md"
            label="most reps"
            value={maxReps}
            canDecrement={maxReps > minReps}
            canIncrement={maxReps < 50}
            onDecrement={() => change((s) => ({ maxReps: s.maxReps - 1 }))}
            onIncrement={() => change((s) => ({ maxReps: s.maxReps + 1 }))}
          />
        </Field>
        <p className={styles.rowHint}>
          Meet or beat the target and the next one is a rep past what you actually did, from{' '}
          {Array(sets).fill(minReps).join(' / ')} up to {Array(sets).fill(maxReps).join(' / ')}; then the weight goes
          up. Changing the number of sets restarts at the bottom at the same weight; changing the reps keeps your
          current target.
        </p>
      </div>
    </section>
  )
}

function CarrySchemeFields({ exercise, update }: { exercise: CarryExerciseDef; update: Update }) {
  const { setsPerSide, minSec, maxSec, stepSec } = exercise.scheme
  const change = (patch: (s: CarryExerciseDef['scheme']) => Partial<CarryExerciseDef['scheme']>) =>
    update((e) => (e.kind === 'carry' ? withCarryScheme(e, patch(e.scheme)) : e))
  return (
    <section className={styles.section} aria-labelledby="exercise-scheme">
      <h2 id="exercise-scheme" className={styles.sectionTitle}>
        Time
      </h2>
      <div className={styles.group}>
        <Field label="Sets per side">
          <Stepper
            size="md"
            label="sets per side"
            value={setsPerSide}
            canDecrement={setsPerSide > 1}
            canIncrement={setsPerSide < 4}
            onDecrement={() => change((s) => ({ setsPerSide: s.setsPerSide - 1 }))}
            onIncrement={() => change((s) => ({ setsPerSide: s.setsPerSide + 1 }))}
          />
        </Field>
        <Field label="Starts at">
          <Stepper
            size="md"
            label="starting time"
            value={`${minSec} s`}
            canDecrement={minSec > 5}
            canIncrement={minSec < maxSec}
            onDecrement={() => change((s) => ({ minSec: s.minSec - 5 }))}
            onIncrement={() => change((s) => ({ minSec: Math.min(s.maxSec, s.minSec + 5) }))}
          />
        </Field>
        <Field label="Up to">
          <Stepper
            size="md"
            label="top time"
            value={`${maxSec} s`}
            canDecrement={maxSec > minSec}
            onDecrement={() => change((s) => ({ maxSec: s.maxSec - 5 }))}
            onIncrement={() => change((s) => ({ maxSec: s.maxSec + 5 }))}
          />
        </Field>
        <Field label="Adds per workout">
          <Stepper
            size="md"
            label="time added per workout"
            value={`${stepSec} s`}
            canDecrement={stepSec > 5}
            onDecrement={() => change((s) => ({ stepSec: s.stepSec - 5 }))}
            onIncrement={() => change((s) => ({ stepSec: s.stepSec + 5 }))}
          />
        </Field>
        <p className={styles.rowHint}>
          Each workout where every side reaches the target adds {stepSec} s, up to {maxSec} s; then the weight goes
          up and the time starts again at {minSec} s.
        </p>
      </div>
    </section>
  )
}

/** New exercises use the rep ladder; they join the end of the workout. */
function NewExerciseForm() {
  const templateId = useTemplateParam()
  const list = exerciseList(templateId)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [loadType, setLoadType] = useState<LoadType>('dumbbell')
  const [loadKg, setLoadKg] = useState(10)
  const [sets, setSets] = useState(3)
  const [minReps, setMinReps] = useState(8)
  const [maxReps, setMaxReps] = useState(12)
  const [restSec, setRestSec] = useState(90)
  const loadStepKg = DEFAULT_STEP[loadType]

  const add = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const exercise: RepsExerciseDef = {
      id: newId(),
      kind: 'reps',
      name: trimmed,
      shortName: trimmed,
      loadType,
      loadStepKg,
      perSide: false,
      restSec,
      scheme: { type: 'staircase', sets, minReps, maxReps },
      baseline: { kind: 'reps', loadKg, reps: bottomRung(sets, minReps) },
    }
    await updateTemplate(templateId, (t) => ({ ...t, exercises: [...t.exercises, exercise] }))
    navigate(list.path, { replace: true })
  }

  return (
    <div className={styles.screen}>
      <ScreenHeader title="New exercise" backTo={list.path} backLabel={list.label} />
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          void add()
        }}
      >
        <label className={styles.formLabel}>
          Name
          <input
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Face pulls"
            maxLength={60}
          />
        </label>
        <div className={styles.group}>
          <Field label="Load" stacked>
            <SegmentedControl
              label="Load type"
              value={loadType}
              options={LOAD_TYPES}
              onChange={(type) => {
                setLoadType(type)
                setLoadKg(type === 'bodyweight' ? 0 : Math.max(DEFAULT_STEP[type], loadKg))
              }}
            />
          </Field>
          <Field label={loadType === 'dumbbell' ? 'Starting weight (one dumbbell)' : 'Starting weight'} stacked>
            <Stepper
              size="md"
              label="starting weight"
              value={formatLoad(loadType, loadKg)}
              onDecrement={() => setLoadKg((kg) => stepLoad(loadType, kg, loadStepKg, -1))}
              onIncrement={() => setLoadKg((kg) => stepLoad(loadType, kg, loadStepKg, 1))}
            />
          </Field>
          <Field label="Sets">
            <Stepper
              size="md"
              label="sets"
              value={sets}
              canDecrement={sets > 1}
              canIncrement={sets < 8}
              onDecrement={() => setSets((n) => clamp(n - 1, 1, 8))}
              onIncrement={() => setSets((n) => clamp(n + 1, 1, 8))}
            />
          </Field>
          <Field label="Fewest reps">
            <Stepper
              size="md"
              label="fewest reps"
              value={minReps}
              canDecrement={minReps > 1}
              canIncrement={minReps < maxReps}
              onDecrement={() => setMinReps((n) => clamp(n - 1, 1, maxReps))}
              onIncrement={() => setMinReps((n) => clamp(n + 1, 1, maxReps))}
            />
          </Field>
          <Field label="Most reps">
            <Stepper
              size="md"
              label="most reps"
              value={maxReps}
              canDecrement={maxReps > minReps}
              canIncrement={maxReps < 50}
              onDecrement={() => setMaxReps((n) => clamp(n - 1, minReps, 50))}
              onIncrement={() => setMaxReps((n) => clamp(n + 1, minReps, 50))}
            />
          </Field>
          <Field label="Rest after each set">
            <Stepper
              size="md"
              label="rest time"
              value={formatDuration(restSec)}
              canDecrement={restSec > MIN_REST_SEC}
              canIncrement={restSec < MAX_REST_SEC}
              onDecrement={() => setRestSec((s) => clamp(s - 15, MIN_REST_SEC, MAX_REST_SEC))}
              onIncrement={() => setRestSec((s) => clamp(s + 15, MIN_REST_SEC, MAX_REST_SEC))}
            />
          </Field>
        </div>
        <Button variant="primary" size="lg" block type="submit" disabled={!name.trim()}>
          Add to workout
        </Button>
      </form>
    </div>
  )
}

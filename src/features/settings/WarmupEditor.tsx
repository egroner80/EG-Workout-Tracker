import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useTargets } from '../../app/liveData'
import { Button } from '../../components/Button'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Sheet } from '../../components/Sheet'
import { Stepper } from '../../components/Stepper'
import { Toggle } from '../../components/Toggle'
import { IconPlus } from '../../components/icons'
import { newId } from '../../data/ids'
import { getTemplate } from '../../data/repositories/templateRepo'
import { formatDuration, formatWarmupTarget } from '../../domain/format'
import { clamp } from '../../domain/math'
import type { ResolvedPrescription } from '../../domain/prescription'
import { isProgressiveStep } from '../../domain/progression/warmup'
import { SQUAT_ROUTINE_GROUP } from '../../domain/sharedWarmup'
import type { TemplateId, WarmupStepDef, WorkoutTemplate } from '../../domain/types'
import { flowsInto, isRepStep } from '../../domain/workout/actions'
import { otherTemplate, templateLabel } from '../../domain/workouts'
import { createOverride } from '../../services/dataCommands'
import { useWorkoutStore } from '../../state/workoutStore'
import { TargetEditorSheet } from '../targets/TargetEditorSheet'
import { NameField } from './NameField'
import styles from './Settings.module.css'
import { Field, ReorderButtons, SegmentedControl } from './SettingsControls'
import { moveById, updateTemplate, updateWarmupStep } from './settingsActions'
import { useTemplateParam } from './useTemplateParam'

const MIN_SEC = 5
const MAX_SEC = 1800
const MIN_REPS = 1
const MAX_REPS = 50
/** A new rep step's time estimate per rep, for warm-up totals. */
const SEC_PER_REP = 3

const WARMUP_NAME: Record<TemplateId, string> = { upper: 'upper-body warm-up', lower: 'lower-body warm-up' }
const MEASURES = [
  { value: 'time', label: 'Time' },
  { value: 'reps', label: 'Reps' },
] as const
const NAME_LIST = new Intl.ListFormat('en', { type: 'conjunction' })

type Measure = (typeof MEASURES)[number]['value']
type NewStep = Omit<WarmupStepDef, 'id'>

export function WarmupEditor() {
  const templateId = useTemplateParam()
  const other = otherTemplate(templateId)
  const data = useTargets(templateId)
  const sharedIds = useLiveQuery(async () => new Set((await getTemplate(other)).warmup.map((s) => s.id)), [other])
  const workoutActive = useWorkoutStore((state) => state.session !== null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<WarmupStepDef | null>(null)
  const [editingTarget, setEditingTarget] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!data) return <div className={styles.loading} aria-busy="true" />
  const { template, targets } = data
  const steps = template.warmup
  const isShared = (step: WarmupStepDef) => sharedIds?.has(step.id) ?? false
  const unlocking = removing ? steps.filter((s) => s.activation?.afterStepId === removing.id) : []

  const setIncluded = (step: WarmupStepDef, active: boolean) => {
    setError(null)
    void includeStep(step, targets.get(step.id), active).catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : 'Could not save'),
    )
  }

  return (
    <div className={styles.screen}>
      <ScreenHeader title={`${templateLabel(templateId)} warm-up`} backTo="/settings" backLabel="Settings" />
      <p className={styles.note}>
        Changes apply from your next workout.
        {steps.some(isShared) && ` Editing a step that's also in the ${WARMUP_NAME[other]} changes it there too.`}
        {workoutActive && ' Jump rope and double-under targets unlock once the workout in progress is finished.'}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <ol className={styles.cards}>
        {steps.map((step, index) => (
          <li key={step.id}>
            <StepCard
              step={step}
              trigger={steps.find((s) => s.id === step.activation?.afterStepId)}
              resolved={targets.get(step.id)}
              alsoIn={isShared(step) ? other : undefined}
              flowsOn={flowsStraightOn(steps[index - 1], step)}
              first={index === 0}
              last={index === steps.length - 1}
              workoutActive={workoutActive}
              onEditTarget={() => setEditingTarget(step.id)}
              onToggleIncluded={(on) => setIncluded(step, on)}
              onRemove={() => setRemoving(step)}
            />
          </li>
        ))}
      </ol>
      <Button block icon={<IconPlus size={20} />} onClick={() => setAdding(true)}>
        Add warm-up exercise
      </Button>

      {adding && (
        <AddStepSheet
          onClose={() => setAdding(false)}
          onAdd={(step) => {
            setAdding(false)
            void updateTemplate(templateId, (t) => ({ ...t, warmup: [...t.warmup, { id: newId(), ...step }] }))
          }}
        />
      )}

      <ConfirmSheet
        open={removing !== null}
        title={`Remove ${removing?.name ?? ''}?`}
        description={
          removing && isShared(removing)
            ? `It won't appear in future ${WARMUP_NAME[templateId]}s. The ${WARMUP_NAME[other]} and past workouts keep it.`
            : "It won't appear in future warm-ups. Past workouts keep it."
        }
        confirmLabel="Remove"
        onConfirm={() => {
          const id = removing?.id
          setRemoving(null)
          if (id) void updateTemplate(templateId, (t) => ({ ...t, warmup: t.warmup.filter((s) => s.id !== id) }))
        }}
        onClose={() => setRemoving(null)}
      >
        {unlocking.length > 0 && (
          <p className={styles.warning}>
            {NAME_LIST.format(unlocking.map((s) => s.name))} unlock from this step.{' '}
            {removing && isShared(removing)
              ? `Without it here, they unlock only from the ${removing.name.toLowerCase()} in the ${WARMUP_NAME[other]}.`
              : "Without it they won't unlock in this workout."}
          </p>
        )}
      </ConfirmSheet>

      <TargetEditorSheet data={data} targetId={editingTarget} onClose={() => setEditingTarget(null)} />
    </div>
  )
}

/** Whether the workout runs this step straight on from the one before, as it does the squat routine's holds. */
function flowsStraightOn(previous: WarmupStepDef | undefined, step: WarmupStepDef): boolean {
  return previous !== undefined && flowsInto(previous, step)
}

interface StepCardProps {
  step: WarmupStepDef
  trigger?: WarmupStepDef
  resolved?: ResolvedPrescription
  /** The other workout, when its warm-up has this step too. */
  alsoIn?: TemplateId
  flowsOn: boolean
  first: boolean
  last: boolean
  workoutActive: boolean
  onEditTarget: () => void
  onToggleIncluded: (on: boolean) => void
  onRemove: () => void
}

function StepCard({
  step,
  trigger,
  resolved,
  alsoIn,
  flowsOn,
  first,
  last,
  workoutActive,
  onEditTarget,
  onToggleIncluded,
  onRemove,
}: StepCardProps) {
  const templateId = useTemplateParam()
  const progressive = isProgressiveStep(step)
  const next = resolved?.prescription.kind === 'warmup' ? resolved.prescription : undefined
  const update = (recipe: (s: WarmupStepDef) => WarmupStepDef) => void updateWarmupStep(templateId, step.id, recipe)
  const move = (direction: -1 | 1) => void updateTemplate(templateId, (t) => ({ ...t, warmup: moveById(t.warmup, step.id, direction) }))

  return (
    <article className={styles.card} aria-label={step.name}>
      <NameField name={step.name} label="Warm-up exercise name" onSave={(name) => update((s) => ({ ...s, name }))} />
      {(alsoIn || flowsOn) && (
        <div className={styles.cardNotes}>
          {alsoIn && <p>Also in the {WARMUP_NAME[alsoIn]}</p>}
          {flowsOn && (
            <p>Flows straight on from the previous {step.flowGroup === SQUAT_ROUTINE_GROUP ? 'squat-routine ' : ''}step</p>
          )}
        </div>
      )}

      {progressive ? (
        <div className={styles.fieldRow}>
          <p className={styles.fieldText}>
            <span className={styles.rowLabel}>Next workout</span>
            <span className={styles.value}>
              {next?.active === false ? 'Not unlocked yet' : formatWarmupTarget(step, next?.durationSec)}
            </span>
          </p>
          <Button size="md" disabled={workoutActive} onClick={onEditTarget} aria-label={`Change next ${step.name} duration`}>
            Change
          </Button>
        </div>
      ) : isRepStep(step) ? (
        <Field label={step.perSide ? 'Reps per side' : 'Reps'}>
          <Stepper
            size="md"
            label={`${step.name} reps`}
            value={step.reps}
            canDecrement={step.reps > MIN_REPS}
            canIncrement={step.reps < MAX_REPS}
            onDecrement={() => update((s) => withReps(s, -1))}
            onIncrement={() => update((s) => withReps(s, 1))}
          />
        </Field>
      ) : (
        <Field label={step.perSide ? 'Time per side' : 'Duration'}>
          <Stepper
            size="md"
            label={`${step.name} duration`}
            value={formatDuration(step.durationSec)}
            canDecrement={step.durationSec > MIN_SEC}
            onDecrement={() => update((s) => ({ ...s, durationSec: clamp(s.durationSec - 5, MIN_SEC, MAX_SEC) }))}
            onIncrement={() => update((s) => ({ ...s, durationSec: clamp(s.durationSec + 5, MIN_SEC, MAX_SEC) }))}
          />
        </Field>
      )}

      {!progressive && (
        <Toggle label="Each side" checked={step.perSide ?? false} onChange={(perSide) => update((s) => withPerSide(s, perSide))} />
      )}

      {step.activation && (
        <Toggle
          label="In the warm-up"
          description={`Joins by itself once ${trigger?.name.toLowerCase() ?? 'its trigger step'} reaches ${formatDuration(step.activation.whenDurationReachesSec)}.`}
          checked={next?.active ?? false}
          disabled={workoutActive}
          onChange={onToggleIncluded}
        />
      )}

      {step.progression && (
        <>
          <Field label="Adds per workout">
            <Stepper
              size="md"
              label={`${step.name} increase per workout`}
              value={`${step.progression.stepSec} s`}
              canDecrement={step.progression.stepSec > 5}
              onDecrement={() => void updateProgression(templateId, step.id, (p) => ({ ...p, stepSec: clamp(p.stepSec - 5, 5, 120) }))}
              onIncrement={() => void updateProgression(templateId, step.id, (p) => ({ ...p, stepSec: clamp(p.stepSec + 5, 5, 120) }))}
            />
          </Field>
          <Field label="Up to">
            <Stepper
              size="md"
              label={`${step.name} maximum`}
              value={formatDuration(step.progression.maxSec)}
              canDecrement={step.progression.maxSec > 15}
              onDecrement={() => void updateProgression(templateId, step.id, (p) => ({ ...p, maxSec: clamp(p.maxSec - 15, 15, MAX_SEC) }))}
              onIncrement={() => void updateProgression(templateId, step.id, (p) => ({ ...p, maxSec: clamp(p.maxSec + 15, 15, MAX_SEC) }))}
            />
          </Field>
        </>
      )}

      <div className={styles.cardActions}>
        <ReorderButtons name={step.name} first={first} last={last} onMove={move} />
        <Button size="md" variant="ghost" className={styles.removeButton} onClick={onRemove} aria-label={`Remove ${step.name}`}>
          Remove
        </Button>
      </div>
    </article>
  )
}

/** A rep step's duration is a time estimate for the whole step, never below a second. */
const estimateSec = (seconds: number) => Math.max(1, Math.round(seconds))

/** Changes a rep step's count; its time estimate keeps the step's pace. */
function withReps(step: WarmupStepDef, change: number): WarmupStepDef {
  if (!isRepStep(step)) return step
  const reps = clamp(step.reps + change, MIN_REPS, MAX_REPS)
  return { ...step, reps, durationSec: estimateSec((step.durationSec * reps) / step.reps) }
}

/**
 * Turns "each side" on or off. A timed step's duration is already per side;
 * a rep step's estimate covers the whole step, so it doubles or halves.
 */
function withPerSide(step: WarmupStepDef, perSide: boolean): WarmupStepDef {
  if (!isRepStep(step) || Boolean(step.perSide) === perSide) return { ...step, perSide }
  return { ...step, perSide, durationSec: estimateSec(perSide ? step.durationSec * 2 : step.durationSec / 2) }
}

/** Turns a step that unlocks later (double unders) on or off for the next workout. */
async function includeStep(step: WarmupStepDef, resolved: ResolvedPrescription | undefined, active: boolean) {
  const durationSec = resolved?.prescription.kind === 'warmup' ? resolved.prescription.durationSec : step.durationSec
  await createOverride(step.id, { kind: 'warmup', durationSec, active }, Date.now())
}

interface CapChange {
  from: number
  to: number
}

/**
 * Changes a step's growth. Steps that unlock from this one follow its top
 * duration, so double unders still join when jump rope tops out. The shared
 * step changes in the other workout too, and so do the steps there that unlock
 * from it: that workout may keep double unders this one removed.
 */
async function updateProgression(
  templateId: TemplateId,
  id: string,
  recipe: (progression: NonNullable<WarmupStepDef['progression']>) => NonNullable<WarmupStepDef['progression']>,
) {
  let cap: CapChange | undefined
  await updateTemplate(templateId, (t) => {
    const step = t.warmup.find((s) => s.id === id)
    if (!step?.progression) return t
    const progression = recipe(step.progression)
    cap = { from: step.progression.maxSec, to: progression.maxSec }
    return followCap({ ...t, warmup: t.warmup.map((s) => (s.id === id ? { ...s, progression } : s)) }, id, cap)
  })
  const change = cap
  if (change && change.from !== change.to) await updateTemplate(otherTemplate(templateId), (t) => followCap(t, id, change))
}

/** Steps that unlocked when step `id` reached its old top duration unlock at the new one. */
function followCap(template: WorkoutTemplate, id: string, { from, to }: CapChange): WorkoutTemplate {
  const follows = (s: WarmupStepDef) => s.activation?.afterStepId === id && s.activation.whenDurationReachesSec === from
  if (!template.warmup.some(follows)) return template
  return {
    ...template,
    warmup: template.warmup.map((s) =>
      follows(s) && s.activation ? { ...s, activation: { ...s.activation, whenDurationReachesSec: to } } : s,
    ),
  }
}

function AddStepSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (step: NewStep) => void }) {
  const [name, setName] = useState('')
  const [measure, setMeasure] = useState<Measure>('time')
  const [durationSec, setDurationSec] = useState(45)
  const [reps, setReps] = useState(10)
  const add = () => {
    const trimmed = name.trim()
    onAdd(measure === 'reps' ? { name: trimmed, reps, durationSec: reps * SEC_PER_REP } : { name: trimmed, durationSec })
  }
  return (
    <Sheet
      open
      title="Add warm-up exercise"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" block disabled={!name.trim()} onClick={add}>
            Add
          </Button>
          <Button block onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <label className={styles.formLabel}>
          Name
          <input
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Band pull-aparts"
            maxLength={60}
          />
        </label>
        <Field label="Measured by">
          <SegmentedControl label="Measured by" value={measure} options={MEASURES} onChange={setMeasure} />
        </Field>
        {measure === 'reps' ? (
          <Field label="Reps">
            <Stepper
              size="md"
              label="new warm-up reps"
              value={reps}
              canDecrement={reps > MIN_REPS}
              canIncrement={reps < MAX_REPS}
              onDecrement={() => setReps((n) => clamp(n - 1, MIN_REPS, MAX_REPS))}
              onIncrement={() => setReps((n) => clamp(n + 1, MIN_REPS, MAX_REPS))}
            />
          </Field>
        ) : (
          <Field label="Duration">
            <Stepper
              size="md"
              label="new warm-up duration"
              value={formatDuration(durationSec)}
              canDecrement={durationSec > MIN_SEC}
              onDecrement={() => setDurationSec((s) => clamp(s - 5, MIN_SEC, MAX_SEC))}
              onIncrement={() => setDurationSec((s) => clamp(s + 5, MIN_SEC, MAX_SEC))}
            />
          </Field>
        )}
      </div>
    </Sheet>
  )
}

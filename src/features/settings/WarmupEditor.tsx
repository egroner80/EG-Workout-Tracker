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
import { formatDuration, formatPrescription } from '../../domain/format'
import { clamp } from '../../domain/math'
import type { ResolvedPrescription } from '../../domain/prescription'
import { isProgressiveStep } from '../../domain/progression/warmup'
import type { WarmupStepDef } from '../../domain/types'
import { createOverride } from '../../services/dataCommands'
import { useWorkoutStore } from '../../state/workoutStore'
import { TargetEditorSheet } from '../targets/TargetEditorSheet'
import { NameField } from './NameField'
import styles from './Settings.module.css'
import { Field, ReorderButtons } from './SettingsControls'
import { moveById, updateTemplate, updateWarmupStep } from './settingsActions'

const MIN_SEC = 5
const MAX_SEC = 1800

export function WarmupEditor() {
  const data = useTargets()
  const workoutActive = useWorkoutStore((state) => state.session !== null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<WarmupStepDef | null>(null)
  const [editingTarget, setEditingTarget] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!data) return <div className={styles.loading} aria-busy="true" />
  const { template, targets } = data
  const steps = template.warmup

  const setIncluded = (step: WarmupStepDef, active: boolean) => {
    setError(null)
    void includeStep(step, targets.get(step.id), active).catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : 'Could not save'),
    )
  }

  return (
    <div className={styles.screen}>
      <ScreenHeader title="Warm-up" backTo="/settings" backLabel="Settings" />
      <p className={styles.note}>
        Changes apply from your next workout.
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
          onAdd={(name, durationSec) => {
            setAdding(false)
            void updateTemplate((t) => ({ ...t, warmup: [...t.warmup, { id: newId(), name, durationSec }] }))
          }}
        />
      )}

      <ConfirmSheet
        open={removing !== null}
        title={`Remove ${removing?.name ?? ''}?`}
        description="It won't appear in future warm-ups. Past workouts keep it."
        confirmLabel="Remove"
        onConfirm={() => {
          const id = removing?.id
          setRemoving(null)
          if (id) void updateTemplate((t) => ({ ...t, warmup: t.warmup.filter((s) => s.id !== id) }))
        }}
        onClose={() => setRemoving(null)}
      />

      <TargetEditorSheet data={data} targetId={editingTarget} onClose={() => setEditingTarget(null)} />
    </div>
  )
}

interface StepCardProps {
  step: WarmupStepDef
  trigger?: WarmupStepDef
  resolved?: ResolvedPrescription
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
  first,
  last,
  workoutActive,
  onEditTarget,
  onToggleIncluded,
  onRemove,
}: StepCardProps) {
  const progressive = isProgressiveStep(step)
  const next = resolved?.prescription.kind === 'warmup' ? resolved.prescription : undefined
  const move = (direction: -1 | 1) => void updateTemplate((t) => ({ ...t, warmup: moveById(t.warmup, step.id, direction) }))

  return (
    <article className={styles.card} aria-label={step.name}>
      <NameField
        name={step.name}
        label="Warm-up exercise name"
        onSave={(name) => void updateWarmupStep(step.id, (s) => ({ ...s, name }))}
      />

      {progressive ? (
        <div className={styles.fieldRow}>
          <p className={styles.fieldText}>
            <span className={styles.rowLabel}>Next workout</span>
            <span className={styles.value}>{next ? formatPrescription(next) : formatDuration(step.durationSec)}</span>
          </p>
          <Button size="md" disabled={workoutActive} onClick={onEditTarget} aria-label={`Change next ${step.name} duration`}>
            Change
          </Button>
        </div>
      ) : (
        <Field label="Duration">
          <Stepper
            size="md"
            label={`${step.name} duration`}
            value={formatDuration(step.durationSec)}
            canDecrement={step.durationSec > MIN_SEC}
            onDecrement={() => void updateWarmupStep(step.id, (s) => ({ ...s, durationSec: clamp(s.durationSec - 5, MIN_SEC, MAX_SEC) }))}
            onIncrement={() => void updateWarmupStep(step.id, (s) => ({ ...s, durationSec: clamp(s.durationSec + 5, MIN_SEC, MAX_SEC) }))}
          />
        </Field>
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
              onDecrement={() => void updateProgression(step.id, (p) => ({ ...p, stepSec: clamp(p.stepSec - 5, 5, 120) }))}
              onIncrement={() => void updateProgression(step.id, (p) => ({ ...p, stepSec: clamp(p.stepSec + 5, 5, 120) }))}
            />
          </Field>
          <Field label="Up to">
            <Stepper
              size="md"
              label={`${step.name} maximum`}
              value={formatDuration(step.progression.maxSec)}
              canDecrement={step.progression.maxSec > 15}
              onDecrement={() => void updateProgression(step.id, (p) => ({ ...p, maxSec: clamp(p.maxSec - 15, 15, MAX_SEC) }))}
              onIncrement={() => void updateProgression(step.id, (p) => ({ ...p, maxSec: clamp(p.maxSec + 15, 15, MAX_SEC) }))}
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

/** Turns a step that unlocks later (double unders) on or off for the next workout. */
async function includeStep(step: WarmupStepDef, resolved: ResolvedPrescription | undefined, active: boolean) {
  const durationSec = resolved?.prescription.kind === 'warmup' ? resolved.prescription.durationSec : step.durationSec
  await createOverride(step.id, { kind: 'warmup', durationSec, active }, Date.now())
}

/**
 * Changes a step's growth. Steps that unlock from this one follow its top
 * duration, so double unders still join when jump rope tops out.
 */
function updateProgression(
  id: string,
  recipe: (progression: NonNullable<WarmupStepDef['progression']>) => NonNullable<WarmupStepDef['progression']>,
) {
  return updateTemplate((t) => {
    const step = t.warmup.find((s) => s.id === id)
    if (!step?.progression) return t
    const progression = recipe(step.progression)
    return {
      ...t,
      warmup: t.warmup.map((s) => {
        if (s.id === id) return { ...s, progression }
        if (s.activation?.afterStepId === id && step.progression?.maxSec === s.activation.whenDurationReachesSec) {
          return { ...s, activation: { ...s.activation, whenDurationReachesSec: progression.maxSec } }
        }
        return s
      }),
    }
  })
}

function AddStepSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string, durationSec: number) => void }) {
  const [name, setName] = useState('')
  const [durationSec, setDurationSec] = useState(45)
  return (
    <Sheet
      open
      title="Add warm-up exercise"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" block disabled={!name.trim()} onClick={() => onAdd(name.trim(), durationSec)}>
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
      </div>
    </Sheet>
  )
}

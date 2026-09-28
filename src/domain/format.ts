import type { ActualEffort, ActualSet, CarryMode, ExerciseLog, LoadType, Prescription, Recommendation } from './types'

const MINUS = '−'
const DASH = '–'

export function formatKg(kg: number): string {
  return String(Number(kg.toFixed(2)))
}

/** "18 kg", "BW", "BW + 5 kg", "Assisted −10 kg". Dumbbell loads are per dumbbell. */
export function formatLoad(loadType: LoadType, kg: number): string {
  if (loadType !== 'bodyweight') return `${formatKg(kg)} kg`
  if (kg === 0) return 'BW'
  if (kg > 0) return `BW + ${formatKg(kg)} kg`
  return `Assisted ${MINUS}${formatKg(Math.abs(kg))} kg`
}

/** Cards join with an em dash ("5 — 5 — 6"); summaries pass " / ". */
export function formatReps(reps: readonly (number | null)[], separator = ' — '): string {
  return reps.map((r) => (r === null ? DASH : String(r))).join(separator)
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Actual sets grouped by consecutive load: "18 kg · 5 / 5 · 16 kg · 5". */
export function formatActualSets(loadType: LoadType, sets: readonly ActualSet[], separator = ' / '): string {
  const groups: { loadKg: number; reps: (number | null)[] }[] = []
  for (const set of sets) {
    const last = groups.at(-1)
    if (set.status !== 'done') {
      // A skipped or unlogged set keeps its place without starting a new load group.
      if (last) last.reps.push(null)
      else groups.push({ loadKg: set.loadKg, reps: [null] })
      continue
    }
    if (last && last.loadKg === set.loadKg) last.reps.push(set.reps)
    else groups.push({ loadKg: set.loadKg, reps: [set.reps] })
  }
  return groups.map((g) => `${formatLoad(loadType, g.loadKg)} · ${formatReps(g.reps, separator)}`).join(' · ')
}

/** "18 kg · L 40 / 40 s · R 40 / 35 s" — both sides shown explicitly. */
export function formatActualCarry(loadType: LoadType, efforts: readonly ActualEffort[]): string {
  const loads = [...new Set(efforts.filter((e) => e.status === 'done').map((e) => e.loadKg))]
  const loadText =
    loads.length <= 1
      ? formatLoad(loadType, loads[0] ?? efforts[0]?.loadKg ?? 0)
      : `${loads.map(formatKg).join('/')} kg`
  const side = (s: 'L' | 'R') =>
    `${s} ${efforts
      .filter((e) => e.side === s)
      .map((e) => (e.status === 'done' ? String(e.seconds) : DASH))
      .join(' / ')} s`
  return `${loadText} · ${side('L')} · ${side('R')}`
}

export function formatTimedTarget(seconds: number, setsPerSide: number): string {
  return `${seconds} s per side × ${setsPerSide}`
}

export const CARRY_MODE_LABEL: Record<CarryMode, string> = { carry: 'Carry', march: 'March', hold: 'Static hold' }

/** A logged exercise's plan: "18 kg · 5 / 5 / 6" or "18 kg · 40 s per side × 2". */
export function formatPlanned(log: ExerciseLog): string {
  if (log.kind === 'reps') {
    return formatPrescription({ kind: 'reps', loadKg: log.planned.loadKg, reps: log.planned.sets.map((s) => s.reps) }, log.loadType)
  }
  return formatPrescription(
    { kind: 'timed', loadKg: log.planned.loadKg, seconds: log.planned.seconds, setsPerSide: log.scheme.setsPerSide },
    log.loadType,
  )
}

/** What was actually done: sets grouped by load, or both carry sides. */
export function formatActual(log: ExerciseLog): string {
  return log.kind === 'reps' ? formatActualSets(log.loadType, log.actual) : formatActualCarry(log.loadType, log.actual)
}

/** A full prescription as shown in lists: "BW · 5 / 6 / 6", "18 kg · 40 s per side × 2", "2:10". */
export function formatPrescription(prescription: Prescription, loadType: LoadType = 'dumbbell'): string {
  switch (prescription.kind) {
    case 'reps':
      return `${formatLoad(loadType, prescription.loadKg)} · ${formatReps(prescription.reps, ' / ')}`
    case 'timed':
      return `${formatLoad(loadType, prescription.loadKg)} · ${formatTimedTarget(prescription.seconds, prescription.setsPerSide)}`
    case 'warmup':
      return prescription.active ? formatDuration(prescription.durationSec) : 'Not unlocked yet'
  }
}

/**
 * The "Next:" phrase on the completion screen. Plain bodyweight advances omit
 * the load ("5 / 6 / 6"); repeats read "Repeat …"; everything else names the load.
 */
export function formatNext(rec: Recommendation, loadType: LoadType = 'dumbbell'): string {
  const { prescription, outcome } = rec
  const isRepeat = outcome === 'repeat' || outcome === 'not-performed'

  if (prescription.kind === 'warmup') {
    const duration = formatDuration(prescription.durationSec)
    if (outcome === 'activate') return `Starts at ${duration}`
    if (outcome === 'inactive') return 'Not unlocked yet'
    return isRepeat ? `Repeat ${duration}` : duration
  }

  let body: string
  if (prescription.kind === 'reps') {
    const reps = formatReps(prescription.reps, ' / ')
    body = loadType === 'bodyweight' && prescription.loadKg === 0 ? reps : `${formatLoad(loadType, prescription.loadKg)} · ${reps}`
  } else {
    body = `${formatLoad(loadType, prescription.loadKg)} · ${formatTimedTarget(prescription.seconds, prescription.setsPerSide)}`
  }
  return isRepeat ? `Repeat ${body}` : body
}

/**
 * A warm-up step's planned amount: "10 reps", "6 each side", "30 s each side",
 * or a plain duration. `seconds` overrides the step's own duration (a
 * progressive step's current target).
 */
export function formatWarmupTarget(
  step: { reps?: number; perSide?: boolean; durationSec?: number; plannedSec?: number },
  seconds = step.plannedSec ?? step.durationSec ?? 0,
): string {
  if (step.reps !== undefined) return step.perSide ? `${step.reps} each side` : `${step.reps} ${step.reps === 1 ? 'rep' : 'reps'}`
  return step.perSide ? `${seconds} s each side` : formatDuration(seconds)
}

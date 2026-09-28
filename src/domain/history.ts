import { formatActual, formatPlanned, formatReps } from './format'
import type {
  ExerciseDef,
  ExerciseLog,
  Recommendation,
  TemplateId,
  WarmupStepDef,
  WorkoutSession,
  WorkoutTemplate,
} from './types'
import { TEMPLATE_IDS } from './workouts'

/**
 * Read models for History and Progress. Finished, non-deleted workouts count;
 * demo workouts are included (and labeled) so the charts have something to
 * show until the demo is cleared.
 */

export function visibleHistory(sessions: readonly WorkoutSession[]): WorkoutSession[] {
  return sessions
    .filter((s) => s.status === 'completed' && s.deletedAt === undefined)
    .sort((a, b) => a.startedAt - b.startedAt)
}

export function isMet(rec: Recommendation | undefined): boolean {
  return rec?.outcome === 'advance' || rec?.outcome === 'increase-load'
}

function doneSets(log: ExerciseLog) {
  return log.actual.filter((set) => set.status === 'done')
}

/** The load actually worked with: the lowest load among done planned sets or efforts. */
export function workingLoad(log: ExerciseLog): number | undefined {
  const planned = log.actual.slice(0, log.kind === 'reps' ? log.planned.sets.length : log.planned.efforts.length)
  const loads = planned.filter((set) => set.status === 'done').map((set) => set.loadKg)
  return loads.length ? Math.min(...loads) : undefined
}

export interface ExerciseLogRow {
  sessionId: string
  date: number
  demo: boolean
  target: string
  actual: string
  met: boolean
  outcome: Recommendation['outcome'] | undefined
}

/** Per-workout rows for one exercise, newest first: date, target, actual, and whether it was met. */
export function exerciseRows(exerciseId: string, sessions: readonly WorkoutSession[]): ExerciseLogRow[] {
  const rows: ExerciseLogRow[] = []
  for (const session of visibleHistory(sessions)) {
    const log = session.exercises.find((e) => e.exerciseId === exerciseId)
    if (!log) continue
    const rec = session.recommendations?.[exerciseId]
    rows.push({
      sessionId: session.id,
      date: session.startedAt,
      demo: session.source === 'demo',
      target: formatPlanned(log),
      actual: formatActual(log),
      met: isMet(rec),
      outcome: rec?.outcome,
    })
  }
  return rows.reverse()
}

export interface LadderRung {
  label: string
  attempts: number
  completed: boolean
  firstDate: number
}

export interface LadderGroup {
  loadKg: number
  startDate: number
  /** The group began because the load went up from the previous group. */
  increased: boolean
  rungs: LadderRung[]
}

/**
 * Consecutive workouts at the same planned load form a group; within a group,
 * each planned rung appears once with its attempt count and whether it was
 * ever completed.
 */
export function ladderGroups(exerciseId: string, sessions: readonly WorkoutSession[]): LadderGroup[] {
  const groups: LadderGroup[] = []
  for (const session of visibleHistory(sessions)) {
    const log = session.exercises.find((e) => e.exerciseId === exerciseId)
    if (!log || !log.actual.some((set) => set.status === 'done')) continue
    const label =
      log.kind === 'reps' ? formatReps(log.planned.sets.map((s) => s.reps), '/') : `${log.planned.seconds} s`
    const met = isMet(session.recommendations?.[exerciseId])

    let group = groups.at(-1)
    if (!group || group.loadKg !== log.planned.loadKg) {
      group = {
        loadKg: log.planned.loadKg,
        startDate: session.startedAt,
        increased: group !== undefined && log.planned.loadKg > group.loadKg,
        rungs: [],
      }
      groups.push(group)
    }
    let rung = group.rungs.find((r) => r.label === label)
    if (!rung) {
      rung = { label, attempts: 0, completed: false, firstDate: session.startedAt }
      group.rungs.push(rung)
    }
    rung.attempts += 1
    rung.completed ||= met
  }
  return groups
}

export interface SeriesPoint {
  date: number
  value: number
  sessionId: string
}

/** Working load per workout (skips workouts where nothing was done). */
export function loadSeries(exerciseId: string, sessions: readonly WorkoutSession[]): SeriesPoint[] {
  const points: SeriesPoint[] = []
  for (const session of visibleHistory(sessions)) {
    const log = session.exercises.find((e) => e.exerciseId === exerciseId)
    const load = log ? workingLoad(log) : undefined
    if (load !== undefined) points.push({ date: session.startedAt, value: load, sessionId: session.id })
  }
  return points
}

/** Total reps (or total carry seconds) actually done per workout; skipped sets add nothing. */
export function volumeSeries(exerciseId: string, sessions: readonly WorkoutSession[]): SeriesPoint[] {
  const points: SeriesPoint[] = []
  for (const session of visibleHistory(sessions)) {
    const log = session.exercises.find((e) => e.exerciseId === exerciseId)
    if (!log) continue
    const done = doneSets(log)
    if (done.length === 0) continue
    const value =
      log.kind === 'reps'
        ? log.actual.filter((s) => s.status === 'done').reduce((sum, s) => sum + s.reps, 0)
        : log.actual.filter((e) => e.status === 'done').reduce((sum, e) => sum + e.seconds, 0)
    points.push({ date: session.startedAt, value, sessionId: session.id })
  }
  return points
}

/** Planned duration of a warm-up step in workouts where it was active. */
export function warmupSeries(stepId: string, sessions: readonly WorkoutSession[]): SeriesPoint[] {
  const points: SeriesPoint[] = []
  for (const session of visibleHistory(sessions)) {
    const step = session.warmup.find((s) => s.stepId === stepId && s.active)
    if (step) points.push({ date: session.startedAt, value: step.plannedSec, sessionId: session.id })
  }
  return points
}

/** Dates on which the series stepped up from the previous point. */
export function increaseDates(points: readonly SeriesPoint[]): number[] {
  return points.filter((point, i) => i > 0 && point.value > points[i - 1].value).map((point) => point.date)
}

/** What a Progress page charts: an exercise of one workout, or a warm-up step. */
export type ProgressTarget =
  | { kind: 'exercise'; templateId: TemplateId; exercise: ExerciseDef }
  | { kind: 'warmup'; templateId: TemplateId; step: WarmupStepDef }

/**
 * Finds a target by id in either workout, exercises before warm-up steps and
 * upper body first. A warm-up step both workouts share, like the jump rope,
 * resolves to one entry: it has one target and one history.
 */
export function findProgressTarget(
  templates: Readonly<Record<TemplateId, WorkoutTemplate>>,
  targetId: string,
): ProgressTarget | undefined {
  for (const templateId of TEMPLATE_IDS) {
    const exercise = templates[templateId].exercises.find((e) => e.id === targetId)
    if (exercise) return { kind: 'exercise', templateId, exercise }
  }
  for (const templateId of TEMPLATE_IDS) {
    const step = templates[templateId].warmup.find((s) => s.id === targetId)
    if (step) return { kind: 'warmup', templateId, step }
  }
  return undefined
}

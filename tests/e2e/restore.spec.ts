import { expect, test } from '@playwright/test'
import {
  advance,
  exerciseHeading,
  goNext,
  logSetsAsPrescribed,
  openApp,
  setChip,
  START_TIME,
  startWorkout,
  timerSeconds,
  warmupTimer,
} from './helpers'

const DAY = 24 * 3600_000
const MINUTE = 60_000
const staircase = { type: 'staircase', sets: 3, minReps: 5, maxReps: 6 }

/** A backup as the first version wrote it: one template, workouts without a type. */
function firstVersionBackup() {
  const startedAt = START_TIME.getTime() - 3 * DAY
  const finishedAt = startedAt + 45 * MINUTE
  const pullUps = { loadType: 'bodyweight', loadStepKg: 2.5, perSide: false, restSec: 120 }
  return {
    format: 'overload-backup',
    appVersion: '0.1.0',
    schemaVersion: 1,
    exportedAt: START_TIME.getTime() - DAY,
    counts: { sessions: 1, overrides: 0 },
    sessions: [
      {
        id: 'first-version-1',
        status: 'completed',
        source: 'real',
        rev: 3,
        startedAt,
        finishedAt,
        lastInteractionAt: finishedAt,
        createdAt: startedAt,
        updatedAt: finishedAt,
        warmup: [
          {
            stepId: 'jump-rope',
            name: 'Jump rope',
            plannedSec: 120,
            active: true,
            elapsedMs: 120_000,
            completed: true,
            skipped: false,
            progression: { stepSec: 10, maxSec: 300 },
          },
        ],
        exercises: [
          {
            exerciseId: 'pull-ups',
            name: 'Pull-ups',
            shortName: 'Pull-ups',
            ...pullUps,
            kind: 'reps',
            scheme: staircase,
            planned: { loadKg: 0, sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }] },
            actual: [0, 1, 2].map(() => ({ reps: 5, loadKg: 0, status: 'done' })),
          },
        ],
        exerciseIds: ['pull-ups'],
        recommendations: {
          'jump-rope': { targetId: 'jump-rope', outcome: 'advance', prescription: { kind: 'warmup', durationSec: 130, active: true } },
          'pull-ups': { targetId: 'pull-ups', outcome: 'advance', prescription: { kind: 'reps', loadKg: 0, reps: [5, 5, 6] } },
        },
      },
    ],
    overrides: [],
    template: {
      id: 'default',
      warmup: [{ id: 'jump-rope', name: 'Jump rope', durationSec: 120, progression: { stepSec: 10, maxSec: 300 } }],
      exercises: [
        {
          id: 'pull-ups',
          kind: 'reps',
          name: 'Pull-ups',
          shortName: 'Pull-ups',
          ...pullUps,
          scheme: staircase,
          baseline: { kind: 'reps', loadKg: 0, reps: [5, 5, 5] },
        },
      ],
      updatedAt: 0,
    },
    settings: {
      sound: true,
      alwaysAudible: false,
      vibration: true,
      getReadyCountdown: true,
      keepScreenAwake: true,
      theme: 'dark',
      updatedAt: 0,
    },
  }
}

test('reloading mid-rope resumes the countdown where it was', async ({ page }) => {
  await openApp(page)
  await startWorkout(page)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await advance(page, 3_000 + 40_000)
  await expect(warmupTimer(page)).toHaveText(/^1:(18|19|20)$/)

  await page.reload()
  await expect(exerciseHeading(page, 'Jump rope')).toBeVisible()
  const remaining = await timerSeconds(warmupTimer(page))
  expect(remaining).toBeGreaterThanOrEqual(75)
  expect(remaining).toBeLessThanOrEqual(80)
  // Still running, not reset or paused.
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  await advance(page, 10_000)
  expect(await timerSeconds(warmupTimer(page))).toBeLessThanOrEqual(remaining - 9)
})

test('reloading on Dips after two logged sets restores Dips with both sets and the running rest', async ({ page }) => {
  await openApp(page)
  await startWorkout(page)
  await page.getByRole('button', { name: 'Skip warm-up' }).click()
  await expect(exerciseHeading(page, 'Pull-ups')).toBeVisible()
  await goNext(page, 'Dips', 'Dips')
  await logSetsAsPrescribed(page, [1])
  await setChip(page, 2).click()
  await expect(page.getByRole('region', { name: 'Rest timer' })).toBeVisible()

  await page.reload()
  await expect(exerciseHeading(page, 'Dips')).toBeVisible()
  await expect(setChip(page, 1)).toHaveAttribute('aria-pressed', 'true')
  await expect(setChip(page, 2)).toHaveAttribute('aria-pressed', 'true')
  await expect(setChip(page, 3)).toHaveAttribute('aria-pressed', 'false')
  const rest = page.getByRole('region', { name: 'Rest timer' })
  await expect(rest).toBeVisible()
  expect(await timerSeconds(rest.getByRole('timer'))).toBeGreaterThan(110)
})

test('a backup from the first version restores its workouts as upper body, and lower body is suggested next', async ({
  page,
}) => {
  await openApp(page)
  const nav = page.getByRole('navigation', { name: 'Main' })
  await nav.getByRole('link', { name: 'Settings' }).click()
  await page.getByLabel('Backup file').setInputFiles({
    name: 'overload-backup-2026-09-27.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(firstVersionBackup())),
  })
  await page.getByRole('dialog', { name: 'Restore this backup?' }).getByRole('button', { name: 'Restore' }).click()
  await expect(page.getByRole('status')).toContainText('Restored 1 new')

  await nav.getByRole('link', { name: 'History' }).click()
  const restored = page.getByRole('main').getByRole('listitem').filter({ hasNotText: 'demo' })
  await expect(restored).toHaveCount(1)
  await expect(restored).toContainText('Upper')

  await nav.getByRole('link', { name: 'Today' }).click()
  await expect(page.getByRole('radio', { name: 'Lower body' })).toBeChecked()
  await expect(page.getByRole('region', { name: 'Recent' })).toContainText('Upper body')
  // The restored jump rope carries into both workouts.
  await expect(page.getByRole('button', { name: /^Warm-up: .+\. Edit next target$/ })).toContainText('Jump rope 2:10')
  await page.getByRole('radio', { name: 'Upper body' }).click()
  await expect(page.getByRole('button', { name: 'Pull-ups: BW · 5 / 5 / 6. Edit next target' })).toBeVisible()
})

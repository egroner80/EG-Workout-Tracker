import { expect, test } from '@playwright/test'
import {
  advance,
  exerciseHeading,
  goNext,
  logSetsAsPrescribed,
  openApp,
  setChip,
  startWorkout,
  timerSeconds,
  warmupTimer,
} from './helpers'

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

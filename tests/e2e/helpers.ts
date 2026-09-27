import { expect, type Locator, type Page } from '@playwright/test'

/** A Monday morning; the fake clock starts here and keeps flowing unless advanced. */
export const START_TIME = new Date('2026-09-28T07:00:00')

/**
 * Opens the app on a fresh profile with a controllable clock. The clock is
 * installed before navigation so every timer the app creates is fake; it
 * keeps running in real time, and `advance` jumps it forward while firing
 * every tick in between (the app's 250 ms ticker included).
 */
export async function openApp(page: Page) {
  await page.clock.install({ time: START_TIME })
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeEnabled()
}

export async function advance(page: Page, ms: number) {
  await page.clock.runFor(ms)
}

/** START → the demo-data choice → the one-time sound check → the warm-up. */
export async function startWorkout(page: Page, demo: 'clear' | 'keep' = 'clear') {
  await page.getByRole('button', { name: 'Start workout' }).click()
  const choice = page.getByRole('dialog', { name: 'Start your first real workout?' })
  await choice.getByRole('button', { name: demo === 'clear' ? 'Clear demo & start' : 'Keep demo & start' }).click()
  await page.getByRole('dialog', { name: 'Did you hear a chime?' }).getByRole('button', { name: 'Yes, I heard it' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Jump rope' })).toBeVisible()
}

export const warmupTimer = (page: Page) => page.getByRole('main').getByRole('timer')

/** Seconds shown by a m:ss countdown. */
export async function timerSeconds(timer: Locator): Promise<number> {
  const text = (await timer.textContent()) ?? ''
  const [minutes, seconds] = text.trim().replace('+', '').split(':').map(Number)
  return minutes * 60 + seconds
}

export const exerciseHeading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name })

/** The rep chip for a set, whatever its current reps. */
export const setChip = (page: Page, set: number) => page.getByRole('button', { name: new RegExp(`^Set ${set}: \\d+ reps`) })

/** Logging a set starts rest; skipping it keeps the next chip reachable. */
export async function skipRest(page: Page) {
  const rest = page.getByRole('region', { name: 'Rest timer' })
  await expect(rest).toBeVisible()
  await rest.getByRole('button', { name: 'Skip' }).click()
  await expect(rest).toBeHidden()
}

/** Taps each set's chip as prescribed, skipping the rest in between. */
export async function logSetsAsPrescribed(page: Page, sets: number[]) {
  for (const set of sets) {
    await setChip(page, set).click()
    await expect(setChip(page, set)).toHaveAttribute('aria-pressed', 'true')
    await skipRest(page)
  }
}

export async function goNext(page: Page, shortName: string, nextName: string) {
  await page.getByRole('button', { name: `Next: ${shortName}` }).last().click()
  await expect(exerciseHeading(page, nextName)).toBeVisible()
}

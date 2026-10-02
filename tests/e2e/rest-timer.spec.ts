import { expect, test, type Locator, type Page } from '@playwright/test'
import { exerciseHeading, openApp, startWorkout } from './helpers'

// A Galaxy S23 home-screen app with on-screen navigation buttons.
test.use({ viewport: { width: 360, height: 700 } })

/** The keep-screen-on bar only shows when the wake lock is refused, which a phone does not do mid-workout. */
async function grantWakeLock(page: Page) {
  await page.addInitScript(() => {
    const sentinel = { released: false, release: () => Promise.resolve(), addEventListener: () => {} }
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => Promise.resolve(sentinel) } })
  })
}

async function center(target: Locator) {
  const box = await target.boundingBox()
  if (!box) throw new Error('target is not rendered')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Fully on screen and on top at its centre, checked without letting Playwright
 * scroll it into view first, then tapped there. A click() would scroll a
 * covered button out from under the timer and hide the very problem.
 */
async function tapUnobstructed(page: Page, target: Locator) {
  await expectUnobstructed(target)
  const { x, y } = await center(target)
  await page.mouse.click(x, y)
}

async function expectUnobstructed(target: Locator) {
  // Not 1: at exactly 700 px a two-line card's − already ends a quarter pixel under the action bar.
  await expect(target).toBeInViewport({ ratio: 0.95 })
  const { x, y } = await center(target)
  const onTop = await target.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), { x, y })
  expect(onTop, 'nothing covers the control').toBe(true)
}

const setControls = (page: Page, set: number) => ({
  plus: page.getByRole('button', { name: `Set ${set}: one more rep` }),
  chip: page.getByRole('button', { name: new RegExp(`^Set ${set}: \\d+ reps?, `) }),
  minus: page.getByRole('button', { name: `Set ${set}: one rep fewer` }),
})

/** The card's scroll area (the full-screen layout's scrolling child); rest must not take any of it. */
async function scrollArea(page: Page) {
  return setControls(page, 1).minus.evaluate((element) => {
    let node = element.parentElement
    while (node?.parentElement && getComputedStyle(node.parentElement).position !== 'fixed') node = node.parentElement
    const box = node?.getBoundingClientRect()
    return box && { top: box.top, bottom: box.bottom }
  })
}

async function boxes(page: Page, set: number) {
  const { plus, chip, minus } = setControls(page, set)
  return Promise.all([plus.boundingBox(), chip.boundingBox(), minus.boundingBox()])
}

async function expectSetRowUnobstructed(page: Page, set: number) {
  const { plus, chip, minus } = setControls(page, set)
  for (const control of [plus, chip, minus]) await expectUnobstructed(control)
}

test('the rest timer never covers the set row on a short phone', async ({ page }) => {
  await grantWakeLock(page)
  await openApp(page)
  await startWorkout(page, 'clear', 'lower')
  await page.getByRole('button', { name: 'Skip warm-up' }).click()
  // Two lines at this width, so the set row sits as low as it gets.
  await expect(exerciseHeading(page, 'Bulgarian split squat')).toBeVisible()
  const rest = page.getByRole('region', { name: 'Rest timer' })

  // Logging a set starts the rest without moving, shrinking, or covering anything in the card.
  const area = await scrollArea(page)
  const before = await boxes(page, 1)
  await tapUnobstructed(page, setControls(page, 1).chip)
  await expect(rest).toBeVisible()
  expect(await scrollArea(page)).toEqual(area)
  expect(await boxes(page, 1)).toEqual(before)
  await expectSetRowUnobstructed(page, 1)

  // Correct the logged set, log the next one and adjust it, all while resting.
  await tapUnobstructed(page, setControls(page, 1).minus)
  await expect(setControls(page, 1).chip).toHaveAccessibleName(/^Set 1: 4 reps, below target\. Tap to undo/)
  await tapUnobstructed(page, setControls(page, 2).chip)
  await tapUnobstructed(page, setControls(page, 2).plus)
  await expect(setControls(page, 2).chip).toHaveAccessibleName(/^Set 2: 6 reps, done\. Tap to undo/)
  await expect(rest).toBeVisible()
  await expect(rest.getByRole('timer')).toHaveText(/^1:\d\d$/)

  // Moving on mid-rest: the next exercise's row is clear straight away, and after a reload.
  await tapUnobstructed(page, page.getByRole('button', { name: 'Next: SL RDL' }))
  await expect(exerciseHeading(page, 'Single-leg RDL')).toBeVisible()
  await expect(rest).toBeVisible()
  expect(await scrollArea(page)).toEqual(area)
  await expectSetRowUnobstructed(page, 1)

  await page.reload()
  await expect(exerciseHeading(page, 'Single-leg RDL')).toBeVisible()
  await expect(rest).toBeVisible()
  expect(await scrollArea(page)).toEqual(area)
  await expectSetRowUnobstructed(page, 1)
})

import { expect, test, type Page } from '@playwright/test'
import {
  advance,
  exerciseHeading,
  goNext,
  logSetsAsPrescribed,
  openApp,
  setChip,
  skipRest,
  startWorkout,
  warmupTimer,
} from './helpers'

const WARMUP = ['Jump rope', 'Shoulder CARs', 'Thoracic rotations', 'Scapular pull-ups', 'Easy push-ups']

/** What every exercise should prescribe after this workout, as Home and the summary list it. */
const NEXT_WORKOUT: [string, string][] = [
  ['Pull-ups', 'BW · 5 / 5 / 6'],
  ['Dips', 'BW · 5 / 5 / 5'],
  ['DB Row', '18 kg · 5 / 5 / 5'],
  ['DB Bench', '16 kg · 5 / 5 / 6'],
  ['DB Press', '12 kg · 5 / 5 / 6'],
  ['Hammer curls', '10 kg · 8 / 9'],
  ['Reverse crunch', '10 kg · 10 / 10 / 11'],
  ['Carry', '18 kg · 45 s per side × 2'],
]

const result = (page: Page, name: string) => page.getByRole('region', { name, exact: true })

test('the real-life workout: guided warm-up, a failed set, a lighter load, correct next targets, and a reopen', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000)
  await openApp(page)

  // A fresh profile has demo history for the charts; the first START offers to clear it.
  await startWorkout(page, 'clear')

  // --- Guided warm-up: one START, then every step counts down and hands over by itself ---
  await expect(page.getByText('1 of 5')).toBeVisible()
  await expect(warmupTimer(page)).toHaveText('2:00')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByLabel(/^Starting in [123]$/)).toBeVisible()
  await advance(page, 3_000)
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  await advance(page, 60_000)
  await expect(warmupTimer(page)).toHaveText(/^(1:00|0:59|0:58)$/)
  await advance(page, 60_000)
  await expect(exerciseHeading(page, 'Shoulder CARs')).toBeVisible()
  await expect(page.getByText('2 of 5')).toBeVisible()
  // Four more steps: a 3 s get-ready and 45 s each.
  await advance(page, 4 * 48_000 + 2_000)
  await expect(page.getByRole('heading', { level: 1, name: 'Warm-up complete' })).toBeVisible()
  for (const step of WARMUP) {
    await expect(page.getByRole('listitem').filter({ hasText: step })).toContainText('Done')
  }
  await page.getByRole('button', { name: 'Start strength workout' }).click()

  // --- Pull-ups: the whole prescription on one card, every set as prescribed ---
  await expect(exerciseHeading(page, 'Pull-ups')).toBeVisible()
  await expect(page.getByRole('region', { name: "Today's target" })).toContainText('5 — 5 — 5')
  await setChip(page, 1).click()
  const rest = page.getByRole('region', { name: 'Rest timer' })
  await expect(rest.getByRole('timer')).toHaveText(/^(2:00|1:59|1:58)$/)
  await advance(page, 120_000)
  await expect(rest).toContainText('Rest done')
  await rest.getByRole('button', { name: 'Close' }).click()
  await logSetsAsPrescribed(page, [2, 3])
  await goNext(page, 'Dips', 'Dips')

  // --- Dips: intentionally fail the last set (4 of 5) ---
  await logSetsAsPrescribed(page, [1, 2])
  await page.getByRole('button', { name: 'Set 3: one rep fewer' }).click()
  await expect(setChip(page, 3)).toHaveAccessibleName(/^Set 3: 4 reps, below target/)
  await skipRest(page)
  await goNext(page, 'DB Row', 'One-arm DB row')

  // --- DB row: lower the weight to 16 kg before the first set ---
  await page.getByRole('button', { name: 'Decrease weight' }).click()
  await expect(page.getByRole('group', { name: 'weight' })).toContainText('16 kg')
  await expect(page.getByText('planned 18 kg')).toBeVisible()
  await logSetsAsPrescribed(page, [1, 2, 3])

  // --- The rest as prescribed ---
  await goNext(page, 'DB Bench', 'DB bench press')
  await logSetsAsPrescribed(page, [1, 2, 3])
  await goNext(page, 'DB Press', 'Standing DB press')
  await logSetsAsPrescribed(page, [1, 2, 3])
  await goNext(page, 'Hammer curls', 'DB hammer curls')
  await logSetsAsPrescribed(page, [1, 2])
  await goNext(page, 'Reverse crunch', 'Weighted reverse crunch')
  await logSetsAsPrescribed(page, [1, 2, 3])
  await goNext(page, 'Carry', 'Suitcase carry')

  // --- Suitcase carry: a timer per side, nothing to count ---
  for (const set of [1, 2]) {
    await page.getByRole('button', { name: new RegExp(`^Left, set ${set}: pending`) }).click()
    await expect(page.getByRole('dialog', { name: `Left hand · Set ${set}` })).toContainText('Pick up the weight')
    await advance(page, 5_000 + 40_000)
    await expect(page.getByRole('dialog', { name: 'Switch to right hand' })).toBeVisible()
    await advance(page, 5_000 + 40_000 + 500)
    await expect(page.getByRole('dialog', { name: /hand/ })).toBeHidden()
    await skipRest(page)
  }
  for (const tile of ['Left, set 1', 'Right, set 1', 'Left, set 2', 'Right, set 2']) {
    await expect(page.getByRole('button', { name: `${tile}: 40 seconds recorded. Tap to start the timer.` })).toBeVisible()
  }

  // --- Finish ---
  await page.getByRole('button', { name: 'Finish workout' }).click()
  const finish = page.getByRole('dialog', { name: 'Finish workout?' })
  await expect(finish).toContainText('Everything is logged')
  await finish.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Workout complete' })).toBeVisible()

  // The summary: target vs actual, ✅ only when met, and what comes next.
  const warmup = result(page, 'Warm-up')
  await expect(warmup).toContainText(/Jump rope 2:00 ✅\s*Next: 2:10/)
  await expect(warmup).toContainText('Unlocks at 5:00 of jump rope')

  const pullUps = result(page, 'Pull-ups')
  await expect(pullUps).toContainText(/Actual\s*BW · 5 \/ 5 \/ 5/)
  await expect(pullUps.getByLabel('target met')).toBeVisible()
  await expect(pullUps).toContainText(/Next\s*5 \/ 5 \/ 6/)

  const dips = result(page, 'Dips')
  await expect(dips).toContainText(/Target\s*BW · 5 \/ 5 \/ 5/)
  await expect(dips).toContainText(/Actual\s*BW · 5 \/ 5 \/ 4/)
  await expect(dips.getByLabel('target met')).toHaveCount(0)
  await expect(dips).toContainText(/Next\s*Repeat 5 \/ 5 \/ 5/)

  const row = result(page, 'One-arm DB row')
  await expect(row).toContainText(/Target\s*18 kg · 5 \/ 5 \/ 5/)
  await expect(row).toContainText(/Actual\s*16 kg · 5 \/ 5 \/ 5/)
  await expect(row.getByLabel('target met')).toHaveCount(0)
  await expect(row).toContainText(/Next\s*Repeat 18 kg · 5 \/ 5 \/ 5/)

  await expect(result(page, 'Suitcase carry')).toContainText(/Actual\s*18 kg · L 40 \/ 40 s · R 40 \/ 40 s/)
  const next = page.getByRole('region', { name: 'Next workout' })
  for (const [name, value] of NEXT_WORKOUT) {
    await expect(next.getByRole('listitem').filter({ hasText: name }).first()).toContainText(value)
  }

  // --- Close the app and open it again ---
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('./')
  await expect(reopened.getByRole('button', { name: 'Start workout' })).toBeEnabled()

  // Home: NEXT WORKOUT carries the progression.
  for (const [name, value] of NEXT_WORKOUT) {
    await expect(reopened.getByRole('button', { name: `${name}: ${value}. Edit next target` })).toBeVisible()
  }
  await expect(reopened.getByRole('button', { name: /^Warm-up: 5:10\. Edit next target$/ })).toContainText('Jump rope 2:10')

  // History: the workout with its planned and actual values; the demo workouts are gone.
  await reopened.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'History' }).click()
  const entries = reopened.getByRole('main').getByRole('listitem')
  await expect(entries).toHaveCount(1)
  await expect(entries.first()).toContainText('6/8 targets met')
  await entries.first().getByRole('link').click()

  const dipsDetail = result(reopened, 'Dips')
  await expect(dipsDetail).toContainText(/Planned\s*BW · 5 \/ 5 \/ 5/)
  await expect(dipsDetail).toContainText(/Actual\s*BW · 5 \/ 5 \/ 4/)
  const rowDetail = result(reopened, 'One-arm DB row')
  await expect(rowDetail).toContainText(/Planned\s*18 kg · 5 \/ 5 \/ 5/)
  await expect(rowDetail).toContainText(/Actual\s*16 kg · 5 \/ 5 \/ 5/)
  await expect(result(reopened, 'Warm-up')).toContainText(/Jump rope\s*2:00 · done/)
})

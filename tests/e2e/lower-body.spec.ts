import { expect, test } from '@playwright/test'
import {
  advance,
  exerciseHeading,
  goNext,
  logSetsAsPrescribed,
  openApp,
  pickAndStart,
  skipRest,
  startWorkout,
} from './helpers'

test('a lower-body workout: the squat routine flows, rep and each-side steps, the Copenhagen hold, and upper body is suggested next with the rope carried over', async ({
  page,
}) => {
  test.setTimeout(240_000)
  await openApp(page)

  // Nothing real done yet, so Home suggests upper body; start lower body instead.
  await expect(page.getByRole('radio', { name: 'Upper body' })).toBeChecked()
  await startWorkout(page, 'clear', 'lower')

  // --- Jump rope, then the squat routine: one get-ready, then four holds back to back ---
  await expect(page.getByText('1 of 13')).toBeVisible()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await advance(page, 3_000 + 120_000 + 500)
  await expect(exerciseHeading(page, 'Deep squat')).toBeVisible()
  await advance(page, 3_000 + 30_000 + 500)
  await expect(exerciseHeading(page, 'Deep squat · knee push-outs')).toBeVisible()
  // Already running: no get-ready between the holds.
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  await advance(page, 30_000)
  await expect(exerciseHeading(page, 'Deep squat · side to side')).toBeVisible()
  await advance(page, 30_000)
  await expect(exerciseHeading(page, 'Deep squat · breathe')).toBeVisible()
  await advance(page, 30_000 + 500)

  // --- Five slow squats: counted, not timed ---
  await expect(exerciseHeading(page, 'Slow bodyweight squats')).toBeVisible()
  await expect(page.getByRole('main').getByRole('timer')).toHaveCount(0)
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // --- Mobility drills, then the world's greatest stretch on each side ---
  await expect(exerciseHeading(page, 'Ankle rocks')).toBeVisible()
  await expect(page.getByText('Knee travels over the toes while the heel stays down')).toBeVisible()
  await advance(page, 3 * 48_000 + 500)
  await expect(exerciseHeading(page, 'World’s greatest stretch')).toBeVisible()
  await advance(page, 3_000 + 5_000)
  await expect(page.getByText('Left side', { exact: true })).toBeVisible()
  await advance(page, 27_000)
  await expect(page.getByText('Right side', { exact: true })).toBeVisible()
  await advance(page, 30_000 + 500)

  // --- Rep steps: tap Done after each set of reps ---
  for (const step of ['Bodyweight hip hinges', 'Bodyweight Bulgarian split squat', 'Glute bridges']) {
    await expect(exerciseHeading(page, step)).toBeVisible()
    await expect(page.getByRole('main').getByRole('timer')).toHaveCount(0)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Warm-up complete' })).toBeVisible()
  await page.getByRole('button', { name: 'Start strength workout' }).click()

  // --- Strength: three sets each, then the hamstring curl's two ---
  await expect(exerciseHeading(page, 'Bulgarian split squat')).toBeVisible()
  await logSetsAsPrescribed(page, [1, 2, 3])
  await goNext(page, 'SL RDL', 'Single-leg RDL')
  await logSetsAsPrescribed(page, [1, 2, 3])
  await goNext(page, 'Hip thrust', 'Hip thrust')
  await logSetsAsPrescribed(page, [1, 2, 3])
  await goNext(page, 'Ham curl', 'Sliding hamstring curl')
  await logSetsAsPrescribed(page, [1, 2])
  await goNext(page, 'Copenhagen', 'Copenhagen plank')

  // --- Copenhagen plank: a timed hold per side, with no carry variations ---
  await expect(page.getByRole('radiogroup', { name: 'Variation' })).toHaveCount(0)
  for (const set of [1, 2]) {
    await page.getByRole('button', { name: new RegExp(`^Left, set ${set}: pending`) }).click()
    await expect(page.getByRole('dialog', { name: `Left side · Set ${set}` })).toContainText('Get into position')
    await advance(page, 5_000 + 20_000)
    await expect(page.getByRole('dialog', { name: 'Switch sides' })).toBeVisible()
    await advance(page, 5_000 + 20_000 + 500)
    await expect(page.getByRole('dialog', { name: /side/ })).toBeHidden()
    await skipRest(page)
  }

  // --- Finish: next comes upper body, and it shares today's jump rope ---
  await page.getByRole('button', { name: 'Finish workout' }).click()
  const finish = page.getByRole('dialog', { name: 'Finish workout?' })
  await expect(finish).toContainText('Everything is logged')
  await finish.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Lower body workout complete' })).toBeVisible()
  const next = page.getByRole('region', { name: 'Next workout · Upper body' })
  await expect(next.getByRole('listitem').filter({ hasText: 'Jump rope' })).toContainText('2:10')
  await expect(next.getByRole('listitem').filter({ hasText: 'Pull-ups' })).toContainText('BW · 5 / 5 / 5')

  // --- Home suggests upper body and lists the lower workout ---
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Upper body' })).toBeChecked()
  await expect(page.getByText(/Suggested: Upper body/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Recent' })).toContainText('Lower body')
  await expect(page.getByRole('button', { name: /^Warm-up: .+\. Edit next target$/ })).toContainText('Jump rope 2:10')

  // --- History labels it, and the next upper workout plans the rope where lower left it ---
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'History' }).click()
  await expect(page.getByRole('main').getByRole('listitem').first()).toContainText('Lower')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).click()
  await pickAndStart(page, 'upper')
  await expect(exerciseHeading(page, 'Jump rope')).toBeVisible()
  await expect(page.getByRole('main').getByRole('timer')).toHaveText('2:10')
})

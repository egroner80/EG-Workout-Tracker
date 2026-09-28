import { expect, test } from '@playwright/test'

test('the manifest is installable: standalone, with 192, 512, and maskable icons that resolve', async ({ page, request }) => {
  await page.goto('./')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()
  const manifestUrl = new URL(href!, page.url()).toString()
  const response = await request.get(manifestUrl)
  expect(response.ok()).toBe(true)

  const manifest = (await response.json()) as {
    display: string
    name: string
    short_name: string
    icons: { src: string; sizes: string; purpose?: string }[]
  }
  expect(manifest.display).toBe('standalone')
  expect(manifest.name).toBe('EG Workout Tracker')
  expect(manifest.short_name).toBe('EG Workout')
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(manifest.icons.some((icon) => icon.purpose?.includes('maskable'))).toBe(true)
  for (const icon of manifest.icons) {
    expect((await request.get(new URL(icon.src, manifestUrl).toString())).ok(), icon.src).toBe(true)
  }

  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
  expect((await request.get(new URL(appleIcon!, page.url()).toString())).ok()).toBe(true)
})

test('after the service worker activates, the app opens offline', async ({ page, context }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeEnabled()
  // `ready` resolves once the worker is active, i.e. after the precache finished installing.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

  await context.setOffline(true)
  try {
    await page.reload()
    await expect(page.getByRole('button', { name: 'Start workout' })).toBeEnabled()
    await expect(page.getByRole('button', { name: /^Pull-ups: BW · 5 \/ 5 \/ 5/ })).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})

import { expect, test } from '@playwright/test'

test('the app shell loads and links the web manifest', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBeTruthy()
})

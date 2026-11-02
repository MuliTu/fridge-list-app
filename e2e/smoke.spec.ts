import { test, expect } from '@playwright/test'

// Public, view-only coverage. Authentication and writes stay out of this suite,
// which can also target a deployed URL. Signed-in design QA uses local emulators.
for (const path of ['/', '/stock', '/receipts', '/recipes']) {
  test(`shows the welcome screen when signed out at ${path}`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('רשימת הבית')
    await expect(page.getByRole('heading', { name: 'מטבח רגוע. בית שמח.' })).toBeVisible()
    await expect(page.getByRole('main').getByRole('button', { name: 'התחברות', exact: true })).toBeVisible()
    await expect(page.getByRole('navigation')).toHaveCount(0)
  })
}

test('switches the welcome screen between Hebrew and English', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'שפה', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { name: 'A calmer kitchen. A happier home.' })).toBeVisible()
  await page.getByRole('button', { name: 'Language', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', { name: 'מטבח רגוע. בית שמח.' })).toBeVisible()
})
test('keeps the welcome action reachable on a narrow phone with reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const signIn = page.getByRole('main').getByRole('button', { name: 'התחברות', exact: true })
  await expect(signIn).toBeInViewport()
  await signIn.focus()
  await expect(signIn).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const header = page.locator('.brand-copy')
  const controls = page.locator('.user-chip')
  const [brand, actions] = await Promise.all([header.boundingBox(), controls.boundingBox()])
  expect(brand).not.toBeNull()
  expect(actions).not.toBeNull()
  expect(actions!.x + actions!.width).toBeLessThanOrEqual(brand!.x)
  await page.getByRole('button', { name: 'שפה', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A calmer kitchen. A happier home.' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

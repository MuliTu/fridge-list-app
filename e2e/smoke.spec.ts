import { test, expect, type Page } from '@playwright/test'

// Signed-out smoke coverage — no sign-in, no writes. See playwright.config.ts for why
// signed-in flows (tabs, bought toggle, add/delete, admin panels) aren't covered here.
const waitForHydration = async (page: Page) => {
  // This app is SSR + client-hydrated (TanStack Start) — clicking before hydration
  // finishes is a real, reproducible race. Wait for the network to settle, which
  // lines up with the client bundle having loaded and hydrated.
  await page.waitForLoadState('networkidle')
}

test('loads the signed-out home screen', async ({ page }) => {
  await page.goto('/')
  await waitForHydration(page)

  await expect(page.locator('h1')).toContainText('רשימת הבית')
  await expect(page.getByRole('banner').getByRole('button', { name: /Sign in|התחברות/ })).toBeVisible()
  await expect(page.getByText(/יש להתחבר כדי לצפות ברשימה|sign in to view/i)).toBeVisible()
})

test('does not expose app tabs before sign-in', async ({ page }) => {
  await page.goto('/')
  await waitForHydration(page)

  await expect(page.getByRole('link', { name: /רשימת קניות/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /מלאי/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /קבלות/ })).toHaveCount(0)
})

test('keeps direct stock URLs behind the auth gate', async ({ page }) => {
  await page.goto('/stock')
  await waitForHydration(page)

  await expect(page).toHaveURL(/\/stock$/)
  await expect(page.getByRole('banner').getByRole('button', { name: /Sign in|התחברות/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /מלאי/ })).toHaveCount(0)
})

test('keeps direct receipts URLs behind the auth gate', async ({ page }) => {
  await page.goto('/receipts')
  await waitForHydration(page)

  await expect(page).toHaveURL(/\/receipts$/)
  await expect(page.getByRole('banner').getByRole('button', { name: /Sign in|התחברות/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /קבלות/ })).toHaveCount(0)
})

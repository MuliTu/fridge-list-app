import { test, expect } from '@playwright/test'

// View-only smoke coverage — no sign-in, no writes. See playwright.config.ts for why
// edit-gated flows (bought toggle, add/delete, admin panels) aren't covered here.

test('loads the shopping list tab with the header and all three tabs', async ({ page }) => {
  await page.goto('/')
  // This app is SSR + client-hydrated (TanStack Start) — clicking before hydration
  // finishes is a real, reproducible race (confirmed while writing these tests: an
  // immediate click on the language button silently no-ops). Wait for the network
  // to settle, which lines up with the client bundle having loaded and hydrated.
  await page.waitForLoadState('networkidle')

  await expect(page.locator('h1')).toContainText('🛒')
  await expect(page.getByRole('link', { name: /רשימת קניות/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /מלאי/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /קבלות/ })).toBeVisible()
})

test('navigates to the stock tab', async ({ page }) => {
  await page.goto('/')
  // This app is SSR + client-hydrated (TanStack Start) — clicking before hydration
  // finishes is a real, reproducible race (confirmed while writing these tests: an
  // immediate click on the language button silently no-ops). Wait for the network
  // to settle, which lines up with the client bundle having loaded and hydrated.
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: /מלאי/ }).click()

  await expect(page).toHaveURL(/\/stock$/)
})

test('navigates to the receipts tab', async ({ page }) => {
  await page.goto('/')
  // This app is SSR + client-hydrated (TanStack Start) — clicking before hydration
  // finishes is a real, reproducible race (confirmed while writing these tests: an
  // immediate click on the language button silently no-ops). Wait for the network
  // to settle, which lines up with the client bundle having loaded and hydrated.
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: /קבלות/ }).click()

  await expect(page).toHaveURL(/\/receipts$/)
})

test('shows a sign-in button when not authenticated', async ({ page }) => {
  await page.goto('/')
  // This app is SSR + client-hydrated (TanStack Start) — clicking before hydration
  // finishes is a real, reproducible race (confirmed while writing these tests: an
  // immediate click on the language button silently no-ops). Wait for the network
  // to settle, which lines up with the client bundle having loaded and hydrated.
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('button', { name: /Sign in|התחברות/ })).toBeVisible()
})

test('switches the UI language and back', async ({ page }) => {
  await page.goto('/')
  // This app is SSR + client-hydrated (TanStack Start) — clicking before hydration
  // finishes is a real, reproducible race (confirmed while writing these tests: an
  // immediate click on the language button silently no-ops). Wait for the network
  // to settle, which lines up with the client bundle having loaded and hydrated.
  await page.waitForLoadState('networkidle')

  const html = page.locator('html')
  await expect(html).toHaveAttribute('lang', 'he')
  await expect(html).toHaveAttribute('dir', 'rtl')

  await page.getByRole('button', { name: 'שפה' }).click()

  await expect(html).toHaveAttribute('lang', 'en')
  await expect(html).toHaveAttribute('dir', 'ltr')

  // Switch back so this test doesn't leak a persisted language preference
  // (stored in localStorage) into whichever test runs next in the same browser context.
  await page.getByRole('button', { name: 'Language' }).click()
  await expect(html).toHaveAttribute('lang', 'he')
})

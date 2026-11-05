import { createHash } from 'node:crypto'
import { expect, test, type Browser, type Page } from '@playwright/test'

const householdId = 'owner@example_test'
const shareId = createHash('sha256').update(JSON.stringify([householdId, null])).digest('hex')

const signIn = async (browser: Browser, role: 'owner' | 'editor' | 'outsider', viewport = { width: 1440, height: 900 }) => {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  await page.goto(`/?demoUser=${role}`)
  await page.waitForLoadState('networkidle')
  await page.locator('main').getByRole('button', { name: /התחברות|Sign in/, exact: true }).click()
  await expect(page.locator('main').getByRole('button', { name: /התחברות|Sign in/, exact: true })).toHaveCount(0)
  return { context, page }
}

const openSharedList = async (page: Page) => {
  await page.goto(`/?shared=${shareId}&demoUser=editor`)
  await expect(page.locator('.shared-list-banner')).toContainText('Demo owner')
  await expect(page.locator('.shared-shopping-list')).toContainText('Local dairy')
}

const contrastRatio = async (page: Page, selector: string) => page.locator(selector).evaluate(element => {
  const parse = (value: string) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
  const luminance = (value: string) => {
    const [red, green, blue] = parse(value).map(channel => {
      const normalized = channel / 255
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue
  }
  const style = getComputedStyle(element)
  const foreground = luminance(style.color)
  const background = luminance(style.backgroundColor)
  return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
})

const focusWithKeyboard = async (page: Page, selector: string) => {
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.keyboard.press('Tab')
    if (await page.locator(selector).evaluate(element => element === document.activeElement)) return
  }
  throw new Error(`Keyboard focus did not reach ${selector}`)
}

test('MYW-56 real shared-list UI is isolated, responsive, themed, categorized, and revocation-safe', async ({ browser }) => {
  test.skip(process.env.FRIDGE_DEMO_E2E !== 'true', 'Runs only against the isolated Firebase emulator demo.')

  const editor = await signIn(browser, 'editor')
  await openSharedList(editor.page)
  const sectionBox = await editor.page.locator('.shared-shopping-list').boundingBox()
  const parentBox = await editor.page.locator('.shared-shopping-list').locator('..').boundingBox()
  expect(sectionBox).not.toBeNull()
  expect(parentBox).not.toBeNull()
  expect(sectionBox!.width / parentBox!.width).toBeGreaterThan(0.9)
  await expect(editor.page.locator('.flat-section')).toHaveCount(2)
  await editor.page.getByRole('button', { name: /^Local dairy/ }).click()
  await expect(editor.page.getByText('yogurt')).toBeHidden()

  const selectedLink = '.shared-shopping-navigation a[href*="shared="][aria-current="page"]'
  await expect(editor.page.locator(selectedLink)).toBeVisible()
  expect(await contrastRatio(editor.page, selectedLink)).toBeGreaterThanOrEqual(4.5)
  await editor.page.locator(selectedLink).hover()
  expect(await contrastRatio(editor.page, selectedLink)).toBeGreaterThanOrEqual(4.5)
  await focusWithKeyboard(editor.page, selectedLink)
  await expect(editor.page.locator(selectedLink)).toBeFocused()
  expect(await contrastRatio(editor.page, selectedLink)).toBeGreaterThanOrEqual(4.5)
  await editor.page.locator('.shared-theme-picker select').selectOption('purple')
  await expect(editor.page.locator('.workspace')).toHaveAttribute('data-shared-theme', 'purple')
  await editor.page.goto('/?demoUser=editor')
  await expect(editor.page.locator('.workspace')).not.toHaveAttribute('data-shared-theme', /.+/)

  const mobile = await signIn(browser, 'editor', { width: 390, height: 844 })
  await openSharedList(mobile.page)
  const mobileSection = await mobile.page.locator('.shared-shopping-list').boundingBox()
  const mobileParent = await mobile.page.locator('.shared-shopping-list').locator('..').boundingBox()
  expect(mobileSection!.width / mobileParent!.width).toBeGreaterThan(0.9)
  await expect(mobile.page.locator('.shared-list-banner')).toHaveCSS('position', 'static')

  const outsider = await signIn(browser, 'outsider')
  await outsider.page.goto(`/?shared=${shareId}&demoUser=outsider`)
  await expect(outsider.page.getByRole('alert')).toBeVisible()
  await expect(outsider.page.locator('.shared-list-banner')).toHaveCount(0)

  await openSharedList(editor.page)
  const owner = await signIn(browser, 'owner')
  const revoke = await owner.page.evaluate(async ({ householdId }) => {
    const response = await fetch('/api/shopping-sharing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await (await import('/src/lib/firebase.ts')).getCurrentUserIdToken()}` },
      body: JSON.stringify({ action: 'revoke', householdId, listName: null, email: 'editor@example.test' })
    })
    return { status: response.status, body: await response.text() }
  }, { householdId })
  expect(revoke.status, revoke.body).toBe(200)
  await expect(editor.page.getByRole('alert')).toBeVisible({ timeout: 8_000 })
  await expect(editor.page.locator('.shared-list-banner')).toHaveCount(0)

  await Promise.all([editor.context.close(), mobile.context.close(), outsider.context.close(), owner.context.close()])
})

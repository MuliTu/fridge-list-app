import { expect, test, type Browser, type Page } from '@playwright/test'

test.use({ channel: 'chrome' })

const householdId = 'owner@example_test'
const listName = 'Weekend trip'
const databaseUrl = `http://127.0.0.1:9000/users/${householdId}/groceries.json?ns=demo-fridge-list-default-rtdb`
const requestHeaders = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }

const readGroceries = async (): Promise<Record<string, { item: string; list_name?: string }>> => {
  const response = await fetch(databaseUrl, { headers: requestHeaders })
  expect(response.ok).toBe(true)
  return (await response.json()) ?? {}
}

const signIn = async (browser: Browser, role: 'owner' | 'editor' | 'outsider') => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(`/?demoUser=${role}`)
  await page.waitForLoadState('networkidle')
  await page.locator('main').getByRole('button', { name: /התחברות|Sign in/, exact: true }).click()
  await expect(page.locator('main').getByRole('button', { name: /התחברות|Sign in/, exact: true })).toHaveCount(0)
  return { context, page }
}

const directDelete = async (page: Page, body?: Record<string, string>) => page.evaluate(async ({ householdId, listName, body }) => {
  const token = await (await import('/src/lib/firebase.ts')).getCurrentUserIdToken()
  const response = await fetch(`/api/lists/${householdId}/shopping-lists/${encodeURIComponent(listName)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-actor-uid': 'demo-owner' },
    body: JSON.stringify(body ?? { actorUid: 'demo-owner', ownerUid: 'demo-owner' })
  })
  return { status: response.status, text: await response.text() }
}, { householdId, listName, body })

test('MYW-64 owner confirmation and exact deletion deny recipients and outsiders in the isolated demo', async ({ browser, baseURL }) => {
  test.setTimeout(60_000)
  test.skip(process.env.FRIDGE_DEMO_E2E !== 'true', 'Runs only against the isolated Firebase emulator demo.')

  const initial = {
    'fr13-trip-milk': { item: 'Milk', category: 'Local dairy', bought: false, list_name: listName },
    'fr13-trip-bread': { item: 'Bread', category: 'Vegetables', bought: false, list_name: listName },
    'fr13-other': { item: 'Eggs', category: 'Local dairy', bought: false, list_name: 'Other' }
  }
  const seed = await fetch(databaseUrl, { method: 'PATCH', headers: requestHeaders, body: JSON.stringify(initial) })
  expect(seed.ok).toBe(true)
  const before = await readGroceries()
  expect(before).toMatchObject(initial)

  const recipient = await signIn(browser, 'editor')
  const outsider = await signIn(browser, 'outsider')
  const owner = await signIn(browser, 'owner')
  try {
    for (const page of [recipient.page, outsider.page]) {
      const denied = await directDelete(page)
      expect(denied.status, denied.text).toBe(403)
      expect(await readGroceries()).toEqual(before)
    }
    const signedOut = await fetch(new URL(`/api/lists/${householdId}/shopping-lists/${encodeURIComponent(listName)}`, baseURL), {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-actor-uid': 'demo-owner' },
      body: JSON.stringify({ actorUid: 'demo-owner' })
    })
    expect(signedOut.status).toBe(401)
    expect(await readGroceries()).toEqual(before)

    await owner.page.evaluate(() => localStorage.setItem('appLanguage', 'en'))
    await owner.page.goto(`/?demoUser=owner&list=${encodeURIComponent(listName)}`)
    await expect(owner.page.locator('html')).toHaveAttribute('dir', 'ltr')
    await expect(owner.page.getByText('Milk', { exact: true })).toBeVisible()
    const ownerUid = await owner.page.evaluate(async () => {
      const token = await (await import('/src/lib/firebase.ts')).getCurrentUserIdToken()
      return token ? JSON.parse(atob(token.split('.')[1])).user_id as string : null
    })
    expect(ownerUid).toBe('demo-owner')
    await owner.page.locator('.menu-trigger-btn').click({ timeout: 5_000 })
    await owner.page.getByRole('button', { name: /מחיקת הרשימה|Delete list/ }).click({ timeout: 5_000 })
    const confirmation = owner.page.locator('[role="alertdialog"][data-state="open"]')
    await expect(confirmation).toBeVisible()
    await expect(confirmation).toContainText('Delete the list "Weekend trip" and all 2 items')
    await confirmation.getByRole('button', { name: 'Cancel' }).click({ timeout: 5_000 })
    expect(await readGroceries()).toEqual(before)

    await owner.page.evaluate(() => localStorage.setItem('appLanguage', 'he'))
    await owner.page.reload()
    await expect(owner.page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(owner.page.getByText('Milk', { exact: true })).toBeVisible()
    await owner.page.locator('.menu-trigger-btn').click({ timeout: 5_000 })
    await owner.page.getByRole('button', { name: /מחיקת הרשימה|Delete list/ }).click({ timeout: 5_000 })
    await expect(confirmation).toBeVisible()
    await expect(confirmation).toContainText('למחוק את הרשימה "Weekend trip" וכל 2 הפריטים')
    await confirmation.getByRole('button', { name: /ביטול|Cancel/ }).click({ timeout: 5_000 })
    expect(await readGroceries()).toEqual(before)

    // Reopening the confirmation immediately after cancellation must leave
    // its action above the exiting overlay and clickable by a real pointer.
    await owner.page.locator('.menu-trigger-btn').click({ timeout: 5_000 })
    await owner.page.getByRole('button', { name: /מחיקת הרשימה|Delete list/ }).click({ timeout: 5_000 })
    await expect(confirmation).toBeVisible()
    const deletionResponsePromise = owner.page.waitForResponse(response =>
      response.request().method() === 'DELETE' && response.url().includes('/shopping-lists/')
    )
    await confirmation.getByRole('button', { name: /אישור|Confirm/ }).click({ timeout: 5_000 })
    const deletionResponse = await deletionResponsePromise
    expect(deletionResponse.status(), await deletionResponse.text()).toBe(200)
    await expect.poll(async () => await readGroceries(), { timeout: 8_000 }).toEqual(
      Object.fromEntries(Object.entries(before).filter(([key]) => !key.startsWith('fr13-trip-')))
    )
    await expect(owner.page.getByText('Milk', { exact: true })).toHaveCount(0)
    await expect(owner.page.getByText('Bread', { exact: true })).toHaveCount(0)
    expect(owner.page.url()).not.toContain('list=Weekend')
  } finally {
    await Promise.allSettled([recipient.context.close(), outsider.context.close(), owner.context.close()])
  }
})

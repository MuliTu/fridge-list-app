import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'

test.use({ channel: 'chrome' })

const members = Array.from({ length: 6 }, (_, index) =>
  `<span class="list-member-avatar" aria-label="Member ${index}">M</span>`
).join('')

test('keeps the shared-list identity and controls compact on narrow screens', async ({ page }) => {
  const css = await fs.readFile(path.join(process.cwd(), 'src/components/shopping-sharing.css'), 'utf8')

  for (const width of [360, 180]) for (const direction of ['ltr', 'rtl']) {
    await page.setViewportSize({ width, height: 800 })
    await page.setContent(`<!doctype html><html dir="${direction}"><head><style>
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; }
      h2, p { margin-block: 0; }
      select { font: inherit; }
      .workspace { --surface-strong:#293e5c;--chalk:#f1f5ff;--brand-accent:#a8ccff;--input-alpha:#243550;--border-alpha:#415675; width:100%; }
      ${css}
    </style></head><body><main class="workspace">
      <header class="shared-list-banner" aria-label="Shared list">
        <div class="shared-list-identity"><p class="shared-list-eyebrow">Shared with me</p><h2>רשימת קניות משותפת ארוכה במיוחד למשפחה</h2><p>Shared by בעלים עם שם ארוך מאוד</p></div>
        <div class="shared-list-meta">
          <div class="list-member-avatars" aria-label="Members">${members}</div>
          <label class="shared-theme-picker"><span class="shared-theme-label">Theme</span><select aria-label="Theme"><option>Blue</option></select></label>
        </div>
      </header>
      <div class="shared-list-categories">First grocery item</div>
    </main></body></html>`)

    const geometry = await page.evaluate(() => {
      const banner = document.querySelector('.shared-list-banner')!.getBoundingClientRect()
      const content = document.querySelector('.shared-list-categories')!.getBoundingClientRect()
      const theme = document.querySelector('.shared-theme-picker select')!.getBoundingClientRect()
      return { bannerHeight: banner.height, bannerBottom: banner.bottom, contentTop: content.top,
        pageWidth: document.documentElement.scrollWidth, themeLeft: theme.left, themeRight: theme.right }
    })

    if (width === 360) {
      expect(geometry.bannerHeight).toBeLessThanOrEqual(120)
      expect(geometry.contentTop).toBeLessThanOrEqual(130)
    }
    expect(geometry.contentTop).toBeGreaterThanOrEqual(geometry.bannerBottom)
    expect(geometry.pageWidth).toBeLessThanOrEqual(width)
    expect(geometry.themeLeft).toBeGreaterThanOrEqual(0)
    expect(geometry.themeRight).toBeLessThanOrEqual(width)
    await page.getByLabel('Theme').focus()
    await expect(page.getByLabel('Theme')).toBeFocused()
  }
})

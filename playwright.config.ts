import { defineConfig, devices } from '@playwright/test'

// e2e coverage is scoped to view-only flows because edit actions require real Google
// sign-in. The dev auth bypass exists for interactive manual QA, not deployed CI.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Only start a local dev server when no external URL (e.g. a deployed Vercel
  // preview/prod URL) was provided — the post-deploy check runs against a real
  // deployment and must not spin up a competing local server.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000
      }
})

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // 60s per test so an admin-login that races Next.js on-demand compilation
  // (can be 15–25s under parallel load) still leaves room for the actual
  // assertions. Individual tests may override via test.setTimeout().
  timeout: 60000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
})

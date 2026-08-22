import { defineConfig } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

// Next.js auto-loads .env.local for the dev server, but the Playwright
// runner is a separate Node process that doesn't. Some specs (e.g. the
// I8 Cloudinary deletion assertion in tests/phase3/24-materials.spec.ts)
// need CLOUDINARY_* creds to hit the Admin API directly.
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env', override: false })

export default defineConfig({
  testDir: './tests',
  // Read-only dev-data check. Prints the one command that fixes date rot before
  // the suite spends minutes failing on a missing termin dropdown instead.
  globalSetup: './tests/global-setup.ts',
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

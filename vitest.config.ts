import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const alias = { '@': resolve(__dirname, 'src') }

export default defineConfig({
  test: {
    // Written to coverage/lcov.info, which sonar-project.properties reads.
    // Root-level only: vitest merges both projects into one report.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
      // A red run must still overwrite lcov.info, or Sonar reads the last one.
      reportOnFailure: true,
    },
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./tests/unit/setup.ts'],
          include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
          exclude: ['node_modules', '.next'],
          css: false,
        },
      },
      {
        // React plugin for parse-time JSX handling — some server-action modules
        // transitively import .tsx email templates (e.g. emails/account-credentials.tsx).
        // These tests still run in a node env and don't render React.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          globals: true,
          setupFiles: ['./tests/integration/setup.ts'],
          include: ['tests/integration/**/*.{test,spec}.ts'],
          exclude: ['node_modules', '.next'],
          // Integration tests share a single Prisma client and the live test
          // database — run within a single fork to avoid cross-test contention.
          fileParallelism: false,
        },
      },
    ],
  },
})

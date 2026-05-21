import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const alias = { '@': resolve(__dirname, 'src') }

export default defineConfig({
  test: {
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

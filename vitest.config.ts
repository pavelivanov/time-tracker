import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve('src/shared') }
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Deterministic local time for date math; individual tests may switch TZ.
    env: { TZ: 'Europe/Berlin' }
  }
})

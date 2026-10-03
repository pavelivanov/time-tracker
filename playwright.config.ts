import { defineConfig } from '@playwright/test'

// Drives the built app (`electron-vite build` first): `npm run test:e2e`.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
  use: { trace: 'retain-on-failure' }
})

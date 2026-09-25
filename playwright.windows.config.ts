import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/windows', workers: 1, retries: 0,
  timeout: 15 * 60 * 1000, reporter: [['list'], ['html', { open: 'never' }]],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
})

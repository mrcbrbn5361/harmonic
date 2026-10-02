import { defineConfig } from '@playwright/test';

// G9 E2E regression net: Electron'u gerçek main süreciyle (dist/main/main.js)
// başlatır; renderer Vite dev sunucusundan yüklenir (main.ts isDev davranışı).
// Birim testlerden bağımsız: vitest yalnızca src/**/*.test.ts toplar.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev:renderer',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
    cwd: __dirname,
  },
});

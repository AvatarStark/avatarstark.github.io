import { defineConfig, devices } from '@playwright/test';

const PORT = 8799;
export const BASE = `http://127.0.0.1:${PORT}`;
const DB = process.env.TEST_DATABASE_URL || 'postgres://nexo_web:devpass@localhost:5432/nexo_web_test';

export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: [['list']],
  globalSetup: './global-setup.mjs',
  use: { baseURL: BASE, trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'es-ES', timezoneId: 'America/Havana' },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /funnel-mobile/ },
    { name: 'movil', use: { ...devices['Pixel 7'] }, testMatch: /responsive|funnel-mobile/ },
  ],
  webServer: {
    // E2E_SERVER_CMD permite probar otro arranque, por ejemplo la Edge Function con Deno.
    command: process.env.E2E_SERVER_CMD || 'node src/index.js',
    cwd: '../..',
    url: `${BASE}/api/health`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT), DATABASE_URL: DB, ADMIN_JWT_SECRET: 'e2e'.repeat(16), SERVE_STATIC: '1',
      PUBLIC_SITE_URL: BASE, RATE_LIMIT_SCALE: '50', NODE_ENV: 'test', EDGE_PORT: String(PORT),
      ...(process.env.E2E_SERVER_CMD ? { SITE_ROOT: '../', RATE_LIMIT_STORE: 'db' } : {}),
    },
  },
});

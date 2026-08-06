import { defineConfig, devices } from '@playwright/test';

const deployedBaseUrl=process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: { baseURL: deployedBaseUrl??'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot:'only-on-failure' },
  webServer: deployedBaseUrl?undefined:[
    { command: 'cargo run --manifest-path backend/Cargo.toml', url: 'http://127.0.0.1:8787/api/health', reuseExistingServer: true },
    { command: 'npm run dev -- --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: true },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

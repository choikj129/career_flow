import { defineConfig } from '@playwright/test';
import { FIXTURE_PORT, PORTS } from './tests/e2e/paths';

// E2E: `next build` 후 `next start`로 띄운 앱(포트 3940 시드 / 3941 빈 DB)에 설치된 Chromium으로 접속한다.
// 실제 claude는 쓰지 않는다(tests/fixtures/fake-claude-e2e.mjs). Vitest와는 별개로 `npm run test:e2e`로 실행한다.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { trace: 'retain-on-failure', locale: 'ko-KR' },
  projects: [
    { name: 'seeded', testMatch: /.*\.spec\.ts/, testIgnore: /empty-/, use: { baseURL: `http://127.0.0.1:${PORTS.seeded}` } },
    { name: 'empty', testMatch: /empty-.*\.spec\.ts/, use: { baseURL: `http://127.0.0.1:${PORTS.empty}` } },
  ],
  webServer: [
    { command: `node tests/e2e/start-app.mjs seeded ${PORTS.seeded}`, url: `http://127.0.0.1:${PORTS.seeded}/settings`, timeout: 120_000, reuseExistingServer: false },
    { command: `node tests/e2e/start-app.mjs empty ${PORTS.empty}`, url: `http://127.0.0.1:${PORTS.empty}/settings`, timeout: 120_000, reuseExistingServer: false },
    { command: `node tests/e2e/fixture-server.mjs ${FIXTURE_PORT}`, url: `http://127.0.0.1:${FIXTURE_PORT}/posting-e2e.html`, timeout: 30_000, reuseExistingServer: false },
  ],
});

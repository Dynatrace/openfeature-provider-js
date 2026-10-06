import { defineConfig } from 'vitest/config';

/** poll-cadence scenarios sleep through several real poll intervals */
const SCENARIO_TIMEOUT_MS = 120_000;

export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/**/*.e2e.ts'],
    testTimeout: SCENARIO_TIMEOUT_MS,
    hookTimeout: SCENARIO_TIMEOUT_MS,
  },
});

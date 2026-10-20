import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'api-int',
    include: ['test/**/*.int.test.ts'],
    environment: 'node',
    env: { NODE_ENV: 'test' },
    globalSetup: ['test/helpers/postgres-global-setup.ts'],
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});

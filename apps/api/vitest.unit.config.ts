import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'api-unit',
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.int.test.ts'],
    environment: 'node',
    env: { NODE_ENV: 'test' },
  },
});

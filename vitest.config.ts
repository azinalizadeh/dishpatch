import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/shared/vitest.config.ts',
      'apps/api/vitest.unit.config.ts',
      'apps/api/vitest.int.config.ts',
      'apps/web/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/shared/src/**', 'apps/api/src/**', 'apps/web/src/**'],
      reporter: ['text-summary', 'html'],
      // 06-test-plan.md › CI quality gates (unit job)
      thresholds: {
        'packages/shared/src/**': { lines: 80, branches: 80 },
        'apps/api/src/domain/**': { lines: 80, branches: 80 },
        'packages/shared/src/coverage.ts': { branches: 100 },
      },
    },
  },
});

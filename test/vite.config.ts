import { defineConfig } from 'vite-plus'

// oxlint-disable-next-line import/no-default-export -- Vite resolves the config through its default export
export default defineConfig({
  test: {
    // setup.ts generates __generated__ from specs/ for every validator library first; the suite
    // then type-checks it with tsc and calls the routers through a tRPC caller.
    include: ['*.test.ts'],
    exclude: ['**/node_modules/**'],
    globalSetup: ['./setup.ts'],
    testTimeout: 60_000,
  },
  lint: {
    // Generator output is checked by tsc inside the suite, against its own tsconfig.json.
    ignorePatterns: ['**/node_modules/**', '__generated__/**'],
    plugins: ['typescript', 'unicorn', 'oxc', 'import', 'vitest'],
    options: {
      typeAware: true,
      typeCheck: true,
      reportUnusedDisableDirectives: 'deny',
      denyWarnings: true,
    },
    categories: {
      correctness: 'error',
      suspicious: 'error',
      perf: 'error',
    },
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'typescript/consistent-type-imports': 'error',
      'import/no-default-export': 'error',
      'import/no-duplicates': 'error',
      'vitest/no-identical-title': 'error',
      'vitest/valid-expect': 'error',
      'vitest/valid-title': 'error',
      'vitest/consistent-test-it': 'error',
      'vitest/prefer-strict-equal': 'error',
      'vitest/prefer-each': 'error',
    },
  },
  fmt: {
    ignorePatterns: ['**/node_modules/**', '__generated__/**'],
  },
})

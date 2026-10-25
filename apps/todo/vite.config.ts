import { defineConfig } from 'vite-plus'

// oxlint-disable-next-line import/no-default-export -- Vite resolves the config through its default export
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
  },
  lint: {
    // The generated files are linted with the code around them: they are what a user commits.
    ignorePatterns: ['**/node_modules/**'],
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
})

import { defineConfig } from 'vite-plus'

export default defineConfig({
  // Single source of truth for formatting style. Vite+ merges this root config into every
  // workspace config, so `packages/openapi-to-trpc` and `test` inherit these options and only
  // declare what is specific to them.
  //
  // Do not add `fmt.ignorePatterns` here: it is inherited too, and a root-relative pattern
  // such as `packages/**` makes the workspaces' own `vp check` exclude every file.
  fmt: {
    printWidth: 100,
    singleQuote: true,
    semi: false,
    sortPackageJson: true,
    experimentalSortImports: {},
  },
})

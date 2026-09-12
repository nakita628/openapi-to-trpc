import { defineConfig } from 'vite-plus'

// oxlint-disable-next-line import/no-default-export -- Vite resolves the config through its default export
export default defineConfig({
  pack: {
    entry: {
      cli: './src/index.ts',
      'config/index': './src/config/index.ts',
    },
    dts: true,
    // tsdown defaults to `.mjs` / `.d.mts` for node; `bin` and `exports` point at `.js` / `.d.ts`.
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // The CLI and core suites load the OpenAPI parser, the TypeSpec compiler and ts-morph and
    // write real files; under a fully parallel run the 5s default is contention, not a hung test.
    testTimeout: 30_000,
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**', '**/dist/**'],
      reporter: ['text', 'text-summary'],
    },
  },
  lint: {
    ignorePatterns: ['**/dist/**'],
    // Node-only package: declaring the runtime is what lets rules that resolve globals
    // (`no-undef`, `unicorn/prefer-global-this`) tell `process` apart from a typo.
    env: { node: true, es2024: true },
    // Setting `plugins` replaces oxlint's default list — restate the defaults, then add
    // import / promise / node.
    plugins: ['typescript', 'unicorn', 'oxc', 'import', 'promise', 'node', 'jsdoc'],
    // The repository conventions a glob cannot express (Effect program shape, function
    // declarations, predicate naming); see lint/custom.js.
    jsPlugins: ['./lint/custom.js'],
    options: {
      typeAware: true,
      typeCheck: true,
      // A rule that stops firing must have its `oxlint-disable` comment deleted with it,
      // otherwise the suppression silently outlives its reason.
      reportUnusedDisableDirectives: 'deny',
      // Nothing here is configured as a warning; this keeps a rule that defaults to
      // `warn` from slipping through `vp check` unnoticed.
      denyWarnings: true,
    },
    categories: {
      correctness: 'error',
      suspicious: 'error',
      perf: 'error',
    },
    // Strict by design: exceptions live next to the code as `oxlint-disable-next-line` with a
    // reason, never as `'off'` here. The list mirrors nakita628/hono-takibi minus its Effect
    // rules; rules in the correctness / suspicious / perf categories are already errors via
    // `categories` above and are not restated.
    rules: {
      'custom/effect-gen-return': 'error',
      'custom/no-effect-fn': 'error',
      'custom/no-effect-flatmap': 'error',
      'custom/no-effect-run': 'error',
      'custom/effect-promise-import': 'error',
      'custom/function-declaration': 'error',
      'custom/predicate-is-name': 'error',
      'custom/type-pascal-case': 'error',
      'jsdoc/empty-tags': 'error',
      'jsdoc/check-tag-names': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-console': 'error',
      'no-plusplus': 'error',
      // `_tag` is Effect's discriminant on tagged errors and data types; every other dangling
      // underscore stays a smell.
      'no-underscore-dangle': ['error', { allow: ['_tag'] }],
      'no-undef': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/no-non-null-assertion': 'error',
      'typescript/consistent-type-imports': 'error',
      'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      'typescript/no-misused-promises': 'error',
      'typescript/require-await': 'error',
      'typescript/prefer-readonly': 'error',
      'typescript/prefer-nullish-coalescing': 'error',
      'typescript/switch-exhaustiveness-check': 'error',
      'typescript/no-unsafe-argument': 'error',
      'typescript/no-unsafe-assignment': 'error',
      'typescript/no-unsafe-member-access': 'error',
      'typescript/no-unsafe-call': 'error',
      'typescript/no-unsafe-return': 'error',
      'unicorn/no-array-for-each': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-spread': 'error',
      'unicorn/prefer-string-replace-all': 'error',
      'import/no-cycle': 'error',
      'import/no-duplicates': 'error',
      'no-new-func': 'error',
      'no-return-assign': 'error',
      'no-else-return': 'error',
      'no-lonely-if': 'error',
      'prefer-object-spread': 'error',
      'symbol-description': 'error',
      'typescript/no-deprecated': 'error',
      'typescript/restrict-plus-operands': 'error',
      'typescript/no-confusing-void-expression': 'error',
      'typescript/only-throw-error': 'error',
      'typescript/prefer-promise-reject-errors': 'error',
      'typescript/prefer-reduce-type-parameter': 'error',
      'typescript/prefer-includes': 'error',
      'typescript/prefer-string-starts-ends-with': 'error',
      'typescript/prefer-optional-chain': 'error',
      'typescript/use-unknown-in-catch-callback-variable': 'error',
      'typescript/return-await': 'error',
      'unicorn/no-await-expression-member': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-string-slice': 'error',
      'unicorn/prefer-at': 'error',
      'unicorn/explicit-length-check': 'error',
      'unicorn/throw-new-error': 'error',
      'import/no-default-export': 'error',
      'import/no-mutable-exports': 'error',
      'import/first': 'error',

      // Escape hatches out of the type system, and the unsound types that survive `strict`.
      'typescript/ban-ts-comment': 'error',
      'typescript/prefer-ts-expect-error': 'error',
      'typescript/no-unsafe-function-type': 'error',
      'typescript/no-empty-object-type': 'error',
      'typescript/no-invalid-void-type': 'error',
      'typescript/no-non-null-asserted-nullish-coalescing': 'error',
      'typescript/non-nullable-type-assertion-style': 'error',
      'typescript/no-dynamic-delete': 'error',
      'typescript/strict-void-return': 'error',

      // Declaration style. `consistent-type-definitions: 'type'` locks in `type X = {...}`; the
      // rule's default is the opposite ('interface'), so the option is load-bearing.
      'typescript/consistent-type-definitions': ['error', 'type'],
      'typescript/consistent-type-exports': 'error',
      'typescript/consistent-generic-constructors': 'error',
      'typescript/array-type': 'error',
      'typescript/method-signature-style': 'error',
      'typescript/no-inferrable-types': 'error',
      'typescript/dot-notation': 'error',
      'typescript/prefer-for-of': 'error',
      'typescript/prefer-find': 'error',
      'typescript/prefer-function-type': 'error',
      // ESM-only package: a `require` call would not survive the build.
      'typescript/no-require-imports': 'error',
      'typescript/no-import-type-side-effects': 'error',

      // Rejections and throws must carry an Error, or the CLI reports `[object Object]`.
      'no-throw-literal': 'error',
      'unicorn/error-message': 'error',
      'unicorn/prefer-type-error': 'error',

      // Node / ESM hygiene. `unicorn/import-style` is deliberately absent: `path` is a domain
      // noun here (OpenAPI paths), so a default `node:path` import would shadow locals.
      'unicorn/prefer-module': 'error',
      'unicorn/prefer-global-this': 'error',
      'unicorn/require-module-specifiers': 'error',
      'unicorn/prefer-export-from': 'error',
      'unicorn/prefer-import-meta-properties': 'error',
      'unicorn/no-abusive-eslint-disable': 'error',
      'unicorn/no-anonymous-default-export': 'error',

      // String and array work: this is what a codegen library does all day.
      'prefer-template': 'error',
      'no-useless-concat': 'error',
      'no-multi-str': 'error',
      'unicorn/consistent-template-literal-escape': 'error',
      'unicorn/consistent-existence-index-check': 'error',
      'unicorn/require-array-join-separator': 'error',
      'unicorn/prefer-negative-index': 'error',
      'unicorn/prefer-array-index-of': 'error',
      'unicorn/prefer-array-flat': 'error',
      'unicorn/prefer-object-from-entries': 'error',
      'unicorn/prefer-string-trim-start-end': 'error',
      'unicorn/prefer-code-point': 'error',
      'unicorn/prefer-native-coercion-functions': 'error',
      'unicorn/consistent-empty-array-spread': 'error',
      'unicorn/prefer-single-call': 'error',
      'unicorn/no-useless-collection-argument': 'error',
      'unicorn/no-useless-fallback-in-spread': 'error',
      'unicorn/no-unnecessary-array-flat-depth': 'error',
      'unicorn/no-magic-array-flat-depth': 'error',
      'unicorn/no-unnecessary-slice-end': 'error',
      'unicorn/no-length-as-slice-end': 'error',
      'unicorn/no-unreadable-array-destructuring': 'error',
      'unicorn/no-immediate-mutation': 'error',

      // Regex and numbers.
      'unicorn/prefer-regexp-test': 'error',
      'prefer-regex-literals': 'error',
      'require-unicode-regexp': 'error',
      'no-div-regex': 'error',
      'no-regex-spaces': 'error',
      'unicorn/prefer-number-properties': 'error',
      'unicorn/prefer-math-min-max': 'error',
      'unicorn/prefer-math-trunc': 'error',
      'unicorn/prefer-modern-math-apis': 'error',
      'unicorn/numeric-separators-style': 'error',
      'unicorn/no-zero-fractions': 'error',
      'unicorn/escape-case': 'error',
      'unicorn/no-hex-escape': 'error',
      radix: 'error',
      'prefer-numeric-literals': 'error',
      'prefer-exponentiation-operator': 'error',
      'unicorn/no-typeof-undefined': 'error',

      // Control flow and declarations. `curly: multi-line` keeps the one-line guard clause legal.
      curly: ['error', 'multi-line'],
      'no-useless-return': 'error',
      'unicorn/no-lonely-if': 'error',
      'unicorn/prefer-logical-operator-over-ternary': 'error',
      'unicorn/prefer-default-parameters': 'error',
      'unicorn/no-object-as-default-parameter': 'error',
      'unicorn/no-unreadable-iife': 'error',
      'unicorn/no-useless-switch-case': 'error',
      'default-case-last': 'error',
      'default-param-last': 'error',
      'no-fallthrough': 'error',
      'no-case-declarations': 'error',
      'array-callback-return': 'error',
      'no-loop-func': 'error',
      'no-inner-declarations': 'error',
      'block-scoped-var': 'error',
      'init-declarations': 'error',
      'no-redeclare': 'error',
      'no-multi-assign': 'error',
      'no-sequences': 'error',
      'no-useless-assignment': 'error',
      'no-unreachable-loop': 'error',
      // Hoisted `function` declarations are safe to reference above their definition.
      'no-use-before-define': ['error', { functions: false }],
      'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
      'arrow-body-style': 'error',
      'prefer-arrow-callback': 'error',
      'guard-for-in': 'error',
      'no-labels': 'error',
      'no-label-var': 'error',
      'no-extra-label': 'error',
      'no-lone-blocks': 'error',
      yoda: 'error',
      'no-self-compare': 'error',

      // Objects and globals.
      'object-shorthand': 'error',
      'operator-assignment': 'error',
      'prefer-object-has-own': 'error',
      'no-prototype-builtins': 'error',
      'no-object-constructor': 'error',
      'no-array-constructor': 'error',
      'no-new-wrappers': 'error',
      'unicorn/new-for-builtins': 'error',
      'prefer-rest-params': 'error',
      'no-implicit-globals': 'error',
      'no-extra-bind': 'error',
      'no-useless-computed-key': 'error',
      'unicorn/no-useless-promise-resolve-reject': 'error',
      'unicorn/prefer-structured-clone': 'error',
      'unicorn/prefer-optional-catch-binding': 'error',
      'unicorn/catch-error-name': ['error', { name: 'error' }],

      // Code injection surfaces (`eval` itself is already `correctness`).
      'no-script-url': 'error',
      'no-bitwise': 'error',
      'no-void': ['error', { allowAsStatement: true }],
      'no-empty': 'error',
      'no-empty-function': 'error',
      'unicode-bom': 'error',
      // `capIsNew: false`: Effect Schema's constructors are capitalized functions
      // (`Schema.TemplateLiteral`, `Schema.Literals`) called without `new`.
      'new-cap': ['error', { capIsNew: false }],
      // A parked TODO is debt that belongs in an issue, not in the source.
      'no-warning-comments': 'error',
      // A `${...}` inside a single-quoted string is almost always a template literal that lost
      // its backticks — a real hazard when the product is emitted source.
      'no-template-curly-in-string': 'error',

      // promise / node rules sit outside the enabled categories.
      'promise/param-names': 'error',
      'promise/valid-params': 'error',
      'promise/spec-only': 'error',
      'promise/no-new-statics': 'error',
      'promise/no-multiple-resolved': 'error',
      'promise/no-return-wrap': 'error',
      'promise/no-return-in-finally': 'error',
      'promise/no-nesting': 'error',
      'promise/no-promise-in-callback': 'error',
      'promise/no-callback-in-promise': 'error',
      'promise/catch-or-return': 'error',
      'promise/always-return': 'error',
      'promise/prefer-catch': 'error',
      'node/no-exports-assign': 'error',
      'node/no-new-require': 'error',
      'node/no-mixed-requires': 'error',
      'node/global-require': 'error',
      'node/no-path-concat': 'error',
      'node/handle-callback-err': 'error',
      'node/callback-return': 'error',

      // Module graph. `extensions` keeps relative specifiers `.js`-suffixed, which NodeNext
      // resolution requires at runtime and `tsc` does not check.
      'import/extensions': ['error', 'always', { ignorePackages: true }],
      'import/export': 'error',
      'import/unambiguous': 'error',
      'import/no-commonjs': 'error',
      'import/no-named-default': 'error',
      'import/no-unassigned-import': 'error',
      'import/no-named-as-default': 'error',
      'import/no-anonymous-default-export': 'error',
      'import/consistent-type-specifier-style': 'error',
      'import/no-self-import': 'error',
      'import/no-absolute-path': 'error',
      'import/no-empty-named-blocks': 'error',
      'no-shadow-restricted-names': 'error',
      'no-delete-var': 'error',
      // `unicorn/filename-case` is deliberately absent: nothing here needs more than one word.
    },
    // Architecture: cli → core → (config, generator, merge). Each directory may import only the
    // siblings named in its message; the regexes match relative specifiers only.
    overrides: [
      {
        files: ['src/config/**', 'src/merge/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                { regex: '^\\.\\./', message: 'leaf module: no project-internal imports allowed' },
              ],
            },
          ],
        },
      },
      {
        // `src/generator` is pure: an OpenAPI document in, TypeScript source out.
        files: ['src/generator/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              paths: [
                { name: 'node:fs', message: 'file I/O belongs in src/core' },
                { name: 'node:fs/promises', message: 'file I/O belongs in src/core' },
              ],
              patterns: [
                {
                  regex: '^(\\.\\./)+(cli|config|core|merge)(/.*)?$',
                  message: 'generator may only import its own modules',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['src/core/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [{ regex: '^(\\.\\./)+cli(/.*)?$', message: 'core may not import cli' }],
            },
          ],
        },
      },
      {
        files: ['src/cli/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '^(\\.\\./)+(generator|merge)(/.*)?$',
                  message: 'cli may only import config, core',
                },
              ],
            },
          ],
        },
      },
      {
        // The convention plugin is an oxlint JS plugin: it walks an untyped ESTree and its
        // contract with oxlint is a default export.
        files: ['lint/**'],
        rules: {
          'import/no-default-export': 'off',
          'import/no-anonymous-default-export': 'off',
          'typescript/no-unsafe-argument': 'off',
          'typescript/no-unsafe-assignment': 'off',
          'typescript/no-unsafe-call': 'off',
          'typescript/no-unsafe-member-access': 'off',
          'typescript/no-unsafe-return': 'off',
        },
      },
      {
        // Tests build fixtures by hand; only the rules that police casts are scoped off.
        files: ['**/*.test.ts'],
        plugins: ['vitest'],
        rules: {
          // A test arranges and asserts imperatively when that is the clearest way to spell
          // a fixture out; the structural rules describe `src`, not the suite.
          'custom/effect-gen-return': 'off',
          'custom/function-declaration': 'off',
          'custom/predicate-is-name': 'off',
          'no-restricted-imports': 'off',
          'typescript/no-explicit-any': 'off',
          'typescript/consistent-type-assertions': 'off',
          'typescript/no-unsafe-type-assertion': 'off',
          'typescript/no-unsafe-argument': 'off',
          'typescript/no-unsafe-assignment': 'off',
          'typescript/no-unsafe-member-access': 'off',
          'typescript/no-unsafe-call': 'off',
          'typescript/no-unsafe-return': 'off',
          // Fixtures feed and assert on source text that contains a literal `${...}`.
          'no-template-curly-in-string': 'off',
          // Test files sit outside tsconfig.json, so type-aware lint sees the default lib, which
          // predates `toSorted`; `.sort()` on fresh arrays stays allowed here.
          'unicorn/no-array-sort': 'off',
          'vitest/no-identical-title': 'error',
          'vitest/valid-expect': 'error',
          'vitest/valid-title': 'error',
          'vitest/valid-describe-callback': 'error',
          'vitest/no-standalone-expect': 'error',
          'vitest/no-test-return-statement': 'error',
          'vitest/no-test-prefixes': 'error',
          'vitest/no-duplicate-hooks': 'error',
          'vitest/consistent-test-it': 'error',
          'vitest/no-alias-methods': 'error',
          // `toStrictEqual` over `toEqual`: `toEqual` ignores `undefined` properties and would
          // let a codegen regression through.
          'vitest/prefer-strict-equal': 'error',
          'vitest/prefer-equality-matcher': 'error',
          'vitest/require-to-throw-message': 'error',
          'vitest/prefer-each': 'error',
          'vitest/no-interpolation-in-snapshots': 'error',
        },
      },
    ],
  },
  // Style (printWidth / quotes / semicolons / import sorting) is inherited from the root
  // vite.config.ts; only the paths this workspace skips are declared here.
  fmt: {
    ignorePatterns: ['**/node_modules/**', '**/dist/**'],
  },
})

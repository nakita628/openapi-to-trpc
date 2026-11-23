# Contributing to openapi-to-trpc

Generates type-safe [tRPC](https://trpc.io/) routers — one router per resource, component
schemas in zod, valibot, arktype or Effect Schema, and `RouterInputs` / `RouterOutputs` — from
OpenAPI or TypeSpec. Published to npm as `openapi-to-trpc`, with a CLI. The OpenAPI / TypeSpec
parser, the validator adapters and the non-schema component generators come from
[oas-truth](https://www.npmjs.com/package/oas-truth); what lives here is tRPC-specific. Built on
Effect v4, formatted by oxfmt, linted by oxlint, tested with Vitest, all through vite-plus (`vp`)
and pnpm. It follows the conventions of `nakita628/hono-takibi` and `nakita628/hekireki`.

This repository is operated **through agent conversation**, and this guide is the rules it is
run by, for people and agents alike: the layout, the commands and the definition of done, the
architecture and the code conventions, the tests, the docs, CI and releasing, and a playbook for
each recurring task. Read the sections that match the files you are about to touch before
editing them; [Layout](#layout) through [Git policy](#git-policy) apply to every change.

The config files are the source of truth: when an instruction contradicts one, quote the config
and ask before changing it.

Everything committed is written in **English** — code, comments, TSDoc, Markdown, commit
messages, workflow comments. textlint and cspell assume it. Test data may be in any language.

## Layout

```text
packages/openapi-to-trpc/     the published package (the only npm artifact)
  src/                        implementation; see the architecture rule for the layering
  lint/custom.js              oxlint JS plugin holding the structural conventions (hono-takibi's)
  vite.config.ts              pack (build), test and lint — the lint block is the design
  README.md                   the user documentation; the root README.md is a symlink to it
test/                         integration suite: generates every library, runs tsc, calls routers
  specs/                      the OpenAPI documents the suite generates from
  setup.ts                    Vitest global setup: writes __generated__ before the suite runs
  vite.config.ts              the suite's own test and lint configuration
apps/todo/                    example: a todo API generated from openapi.yaml, with hand-written
                              resolvers, a server and the generated client; its generated files
                              are committed, as a user commits them
scripts/actionlint.ts         downloads a pinned actionlint, verifies its checksum, runs it
scripts/zizmor.ts             downloads a pinned zizmor (workflow security audit), verifies it, runs it
vite.config.ts                formatting only (printWidth 100, single quotes, no semicolons);
                              every workspace inherits it
renovate.json                 dependency updates (Saturdays, Asia/Tokyo); see the CI rule
.github/workflows/test.yml    CI (Test): build, every test suite, then `vp run check`
.github/workflows/lint.yml    CI (Lint): `vp run lint`
.github/workflows/release-please.yml
                              on main: opens the version bump pull request and merges it
.github/workflows/release.yml after Test on main, or started by release-please.yml: tag, npm
                              publish, GitHub release
.github/workflows/delete-closed-branch.yml
                              deletes the branch of a pull request closed without merging
release-please-config.json    how release-please works the next version out
.release-please-manifest.json the version release-please counts from
```

## Commands

Run these from the repository root.

| Goal                                                                     | Command                                                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Install dependencies                                                     | `pnpm install --frozen-lockfile`                                           |
| Everything CI checks (format, oxlint and type checks, then every linter) | `pnpm check`                                                               |
| Autofix formatting, oxlint, markdownlint and textlint                    | `pnpm fix`                                                                 |
| Linters (markdownlint, textlint, cspell, secretlint, actionlint, zizmor) | `pnpm lint`                                                                |
| Every test suite (package, `test/`, then `apps/*`)                       | `pnpm test`                                                                |
| Build `dist`                                                             | `pnpm build`                                                               |
| One test file                                                            | `pnpm --filter ./packages/openapi-to-trpc exec vp test src/<path>.test.ts` |

- `pnpm check` runs `vp check` in every workspace: oxfmt, oxlint with type-aware rules, and the
  TypeScript type check (`typeCheck: true`). Its summary line says `no warnings or lint errors`
  even though it also type-checks.
- The `test/` suite imports the package source directly, so it needs no build. Its global setup
  regenerates `test/__generated__` on every run.
- `apps/todo` is regenerated with its own `pnpm generate`, which runs the built CLI: `pnpm build`
  first. A change to the generated output updates the files it commits in the same change; its
  tests run against them.
- `scripts/*.ts` run on Node's own TypeScript support, so they need Node 24 (CI uses it).

## Definition of done

Before reporting a task finished, **`pnpm check` and `pnpm test` must be green**. One failure
means not done. If you only ran part of it, say which part.

- A behavior change ships with a test that fails before it and passes after.
- A change to the config, the CLI or the generated output updates
  `packages/openapi-to-trpc/README.md` in the same change. The CLI Reference block there is
  `openapi-to-trpc --help` verbatim, and `src/cli/index.test.ts` fails when they differ.
- Report results as they are. Never call a task complete while hiding a failing command, and
  never make a check pass by weakening it.

## Invariants

- **Never relax a linter to get a change through.** Do not set a rule to `'off'`, do not lower
  `categories`, do not drop `denyWarnings`, do not add an `ignorePatterns` / `ignorePaths` entry
  to hide a finding. If a rule genuinely does not fit, say so and ask.
- **Suppressions live next to the code, naming the rule and the reason:**
  `// oxlint-disable-next-line rule-name -- reason`. Never disable a whole file.
  `reportUnusedDisableDirectives: 'deny'` is on, so a suppression that stopped firing must go.
- **No `TODO` / `FIXME`.** `no-warning-comments` rejects them in source, textlint's `no-todo` in
  docs. Parked work belongs in the report.
- **Failures are typed Effect errors**: `ConfigError`, `GenerateError`, `PlatformError`. See the
  Effect rule.
- **Never hand-edit generated files:** `pnpm-lock.yaml` (let pnpm write it), `dist/`,
  `test/__generated__/`.
- **Router files hold the user's code.** A regenerated router is merged into what is on disk
  (`src/merge`); nothing may delete or blindly overwrite it.
- **`effect` and `@effect/platform-node` move together**, in one change. See the CI rule.
- **Never bump `version` in `packages/openapi-to-trpc/package.json` by hand.** release-please
  opens and merges the bump (`chore: bump version to x.y.z`) from the Conventional Commits merged
  into `main`, and the bump reaching `main` is what publishes it. The one exception is recovering
  from a failed release when `release.yml` asks for a new version (see the CI rule). Never
  `npm publish`, `pnpm publish` or push a `v*` tag by hand.

## Working order

1. Read the rules in force for the files you are about to touch
   (`lint` in the workspace's `vite.config.ts`, and the matching sections of this guide).
2. Implement it the way the surrounding code is written. Do not introduce a second idiom.
3. `pnpm fix`, then `pnpm check` and `pnpm test`.
4. Commit when asked (see Git policy).
5. In the final report state what changed, which commands verified it, and anything left out.

## Git policy

- Commit when the owner asks. Never force-push and never rewrite pushed history. Push to `main`
  only when asked: what reaches `main` is released.
- One logical change per commit, and one per pull request. `main` takes squash merges, so the
  pull request title becomes the commit, and release-please reads it to decide the release. The
  title, and the subject of anything pushed to `main` directly, is a Conventional Commit:
  `type(scope): summary`, imperative mood, no trailing period
  (`fix(merge): keep middleware on a procedure when regenerating a router`). The PR title
  workflow fails a pull request whose title has any other shape.
  - `feat` raises the minor version, `fix` and `perf` the patch; `!` before the colon
    (`feat(config)!: …`) marks a breaking change, which raises the minor while the version is
    `0.x`. `refactor`, `docs`, `test`, `build`, `ci` and `chore` release nothing, and neither
    does a commit that changes nothing under `packages/openapi-to-trpc`.
  - The scope is the part a user notices: `router`, `components`, `types`, `client`, `merge`,
    `cli`, `config`, `example`, `deps`. `.github/pull_request_template.md` carries the list.
  - The body explains why. The commits of a pull request are squashed into its title, so the
    title is what has to follow this; writing them the same way costs nothing.
- Do not commit generated output, secrets or local tooling files.

## Architecture

### Layering

Dependencies run **one way**. The order is enforced by the `no-restricted-imports` overrides in
the `lint` block of `packages/openapi-to-trpc/vite.config.ts`, each carrying a message that says
what the directory may import:

```text
layer 0  config  merge            (leaves: nothing internal)
layer 0  generator                (pure: imports only its own modules, no node:fs)
layer 1  core -> config, generator, merge
layer 2  cli -> config, core      (both loaded lazily, through import())
entry    src/index.ts -> cli
```

Wanting to reach an upper layer means the design is wrong — pass the value in as an argument, or
move the shared code down a layer. A new edge is a change to the overrides first, and to the code
second. A new `src/` directory gets its own override.

### Responsibilities

| Directory    | Owns                                                                                                                                                                                                                                                            | Never does                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `config/`    | the config schema, `defineConfig`, `parseConfig`, `readConfig`, `ConfigError`                                                                                                                                                                                   | import anything internal              |
| `generator/` | code builders: `components.ts` (every component kind, imports), `router.ts` (procedures, routers, `appRouter`, router types), `library.ts` (what each validator library needs on top of oas-truth), `client.ts` (the typed tRPC client) — string in, string out | touch the filesystem or run an Effect |
| `merge/`     | `mergeRouter`: a regenerated router merged into what the user already wrote                                                                                                                                                                                     | know about OpenAPI                    |
| `core/`      | `makeFiles` (config + document → every file, pure) and `openapiToTrpc` (the Effect program: parse, build, merge, format, write)                                                                                                                                 | parse the command line                |
| `cli/`       | the `openapi-to-trpc` command on `effect/cli`                                                                                                                                                                                                                   | generator logic                       |

### What comes from oas-truth

`parseOpenAPI`, `makeAdapter` (the zod / valibot / arktype / effect expression builders), the
`make*Declarations` builders for every non-schema component kind (one declaration per entry,
which a target bundles into one file or splits), `makeSchemaDeclarations` for
`components.schemas` and the naming helpers (`makeSchemaIdentifiers`, `declarationFileName`,
`toIdentifierPascalCase`, `schemaRefToName`, `makeSafeKey`, `isRecord`) are imported from
`oas-truth`. `schema-truth` is oas-truth's dependency, not this package's. Both are developed in
[nakita628/truth](https://github.com/nakita628/truth). Do not reimplement them here, and do not
work around a bug or a gap in them either: a problem whose cause is there is reported there as an
issue and fixed there (Fix a generator bug in the playbooks says how), and the fix reaches this
package with the oas-truth update that releases it.

### Output that holds the user's code

Router files (`<output>/<resource>.ts`) are read back and edited in place, the way hono-takibi
merges its handler files: each procedure's `.input()` / `.output()` and the imports of every
module the generator imports are regenerated, a new operation gets a stub and a procedure whose
operation left the document is removed. Everything else is the user's and kept — resolvers, the
procedure a chain builds on (middleware), `.use()` / `.meta()`, comments, other router entries,
other imports and code (a customized `initTRPC`, helpers).

- Never delete, empty or blindly overwrite a router file — not in a cleanup, not on a config
  change.
- A change to what a router file looks like must keep `mergeRouter` able to find the router
  object, the resolvers and the `.input()` / `.output()` calls; add a merge test when the emitted
  structure changes.

Every other output (`<output>/index.ts`, the components, the router types, the client) is the generator's
and is rewritten wholesale.

### The generated code

- It must type-check under `strict`, `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`
  for every validator library, and run: `test/` proves both for every library and layout.
- A resolver starts as a stub that throws `TRPCError` `NOT_IMPLEMENTED`, so a declared `.output()`
  still type-checks before the user implements it.
- A construct a library cannot express fails generation with a message that names it rather than
  emitting code that breaks at runtime.

### Public API

What users can import is exactly the `exports` map of `packages/openapi-to-trpc/package.json`:

- `openapi-to-trpc` → `src/config/index.ts` (`defineConfig` and the config types)
- `openapi-to-trpc/config` → the same module (kept so a config file that already imports the
  subpath still resolves)
- the `openapi-to-trpc` bin → `dist/cli.js`, built from `src/index.ts`

`pack.entry` in `packages/openapi-to-trpc/vite.config.ts` has one entry per output; adding a
subpath means adding it in both places. The config schema and the CLI flags are public too:
changing them updates `packages/openapi-to-trpc/README.md` (`CLI Reference`,
`Full Config Reference`) in the same change. Do not introduce a breaking change on your own
initiative — say what it would take and ask.

## TypeScript conventions

The source of truth is the `lint` block of `packages/openapi-to-trpc/vite.config.ts` (its rule
list mirrors hono-takibi's, minus the Effect-specific parts that do not apply). What follows is
what cannot be worked around. `*.test.ts` relaxes some of it — see the testing rule.
Effect-specific shapes are in the Effect rule.

### Functions and declarations

- A module-level function is a **`function` declaration**. `const f = () => {}` is reported by
  `custom/function-declaration` and `func-style` (an annotated const keeps its contextual type
  and is allowed, as `LIBRARIES` and `MAKERS` are). Closures inside a function may be arrows.
- A pure boolean predicate reads as a question: **`is*` / `has*` / `can*`**
  (`custom/predicate-is-name`).
- A `type` alias is **PascalCase** (`custom/type-pascal-case`).
- Initialize at the declaration (`init-declarations`). No reassigning or writing through a
  parameter (`no-param-reassign` with `props: true`), no `++` (`no-plusplus`; use `+= 1`).
- No `await` inside a loop (`no-await-in-loop`): run independent work together
  (`Effect.all(..., { concurrency: 'unbounded' })`).
- No spread inside a `map` callback that rebuilds each element (`oxc/no-map-spread`): build the
  value in a named function instead.

### Types

- **`type X = {...}` only — no `interface`** (`consistent-type-definitions: 'type'`).
- **No `any`**, **no `!` non-null assertion**, **no type assertions at all**
  (`consistent-type-assertions` with `assertionStyle: 'never'`). Narrow with a guard: `in`, a
  local `is*` function, or `isRecord` from oas-truth.
- Every `unsafe-*` rule is an error. `Object.entries` over an oas-truth map can come back as
  `any`: give it the element type (`Object.entries<PathItem>(...)`) or iterate the keys.
- Type imports are `import type`, in their own statement
  (`consistent-type-imports`, `import/consistent-type-specifier-style`).
- `noUncheckedIndexedAccess: true` — an indexed access includes `undefined`. Handle it with a
  guard or `??`, not an assertion.
- `@ts-ignore` is banned; `@ts-expect-error` needs a description.

### Imports and exports

- **A relative specifier always carries its `.js` extension** (`import/extensions: always`). The
  package resolves NodeNext-style at runtime and `tsc` does not check it. The generated code is
  the exception: it targets bundler resolution and imports extensionless specifiers.
- **No default exports** (`import/no-default-export`), except where a tool requires one: a
  `vite.config.ts` and the Vitest global setup carry a suppression comment that says so, and the
  lint plugin has a scoped override.
- Respect the layering in the architecture rule; `no-restricted-imports` reports a wrong edge.
- ESM only: no `require`, no CommonJS. Node built-ins use the `node:` prefix.

### Errors and async

- Fail through the Effect error channel (see the Effect rule). The one throw in `src` is the pure
  generator's, turned into a `GenerateError` by `core`.
- A catch binding is named **`error`** (`unicorn/catch-error-name`).
- No floating promises. A deliberate fire-and-forget is `void promise`.

### Details

- `console` is banned in `src` (`no-console`); the CLI prints through Effect's `Console`.
- Regular expressions carry the `u` flag (`require-unicode-regexp`), in literals and in
  `new RegExp(source, 'u')`. Under `u` a needless escape is a syntax error, so escape only what
  must be.
- Template literals over concatenation. A `${...}` inside a single-quoted string is rejected
  (`no-template-curly-in-string`) — a real hazard in a code generator, so the generated source
  is always built with template literals.
- No leading-underscore identifiers, except Effect's `_tag`.
- Do not hand-format. oxfmt (`vp fmt`, `pnpm fix`) owns layout and import order. The same style
  (printWidth 100, single quotes, no semicolons) is duplicated in `emit` in `src/core/index.ts`,
  because generated code is formatted at runtime; change both together.

### TSDoc

- Doc comments are TSDoc. **The type lives in the signature, never in the comment.**
- No `@param` / `@returns` boilerplate. The house style is prose over a self-describing
  signature that says _why_, not what the code already shows.

## Effect

The CLI, the config and the core program are written on Effect v4 (see the CI rule for how the
version moves). The shapes below are enforced by
`packages/openapi-to-trpc/lint/custom.js` — hono-takibi's plugin, as is; each rule's message says
what to write instead. `src/generator` and `src/merge` are plain functions and stay that way.

### One shape for an Effect program

```ts
export function readThing(input: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const text = yield* fs.readFileString(input)
    if (text === '') return yield* new GenerateError({ message: `${input} is empty` })
    return text
  })
}
```

- An Effect program is the **return value of a named `function`**, written as
  `return Effect.gen(function* () { ... })` — optionally followed by `.pipe(...)` for scoping or
  recovery (`custom/effect-gen-return`). Never a const-bound arrow, never an inline argument.
  When a helper needs a nested program, extract it into its own function.
- No `Effect.fn` / `Effect.fnUntraced` (`custom/no-effect-fn`).
- No `Effect.flatMap` / `Effect.andThen` (`custom/no-effect-flatmap`): write straight-line
  `yield*` steps with early-return guards. `Effect.map` / `Effect.mapError` in a pipe are fine.
- **Run an Effect only at a boundary** (`custom/no-effect-run`): `src/index.ts` runs the CLI
  through `NodeRuntime.runMain`, and tests may run one. Everywhere else an Effect is returned, so
  its requirements stay visible to the caller.
- `Effect.promise` only wraps a dynamic `import()` (`custom/effect-promise-import`) — the CLI's
  lazy load of `config` and `core`. Anything that can reject goes through `Effect.tryPromise`
  with a `catch` that maps to a typed error.
- A program whose error branch returns must return on every path: end with
  `return yield* ...` (`consistent-return`).

### Errors

- Failures are tagged errors: `ConfigError` (`src/config`) as `Schema.TaggedError` because it
  comes out of a schema decode, and carries `notFound` for a missing config file;
  `GenerateError` (`src/core`) as `Data.TaggedError`. Filesystem failures stay the platform's
  `PlatformError`.
- Every error carries a `message` written for the person who ran the command: what is wrong and,
  where possible, what to do. The CLI renders it as-is (`CliError.UserError`), and turns a
  config that is missing and was never asked for into the help (`CliError.ShowHelp`).
- `src/generator` is pure and has no error channel: a construct it cannot translate throws an
  `Error` with the sentence to show, and `core` turns it into a `GenerateError` through
  `Effect.try`. No other code throws.
- Absorb only the failure you mean: `Effect.catchTag('PlatformError', ...)` for "the file is not
  there yet" (the router merge, the config lookup), not a blanket `orElse`.

### Services

- The filesystem is `FileSystem.FileSystem`, provided once at the boundary:
  `NodeServices.layer` in `src/index.ts`, and in the tests.
- The CLI prints through Effect's `Console`, never `console` (`no-console`); the tests replace
  `Console` with a recorder to read what the command printed.

### Configuration schemas

- Config validation is `effect/Schema` in `src/config`. A new option is a schema field with its
  default as `Schema.withDecodingDefault`, an `annotate({ title, description, examples })`, and a
  check whose message names what is wrong. A rule across fields is a `Schema.makeFilter` on the
  struct that owns both fields.
- Keep `defineConfig`'s input type (`ConfigSchema.Encoded`) accurate: it is what users get
  completion and errors from while they type.
- `effect/cli` owns parsing, `--help`, `--version` and completions. `<input>` is
  decoded through a schema (`Argument.withSchema`) and `--schema` through `Flag.Literals`, so a
  wrong value is reported by the parser, with the help.

## Tests

Tests run on **Vitest through vite-plus** and live next to what they cover
(`src/cli/index.test.ts`). The package suite is configured in the `test` block of
`packages/openapi-to-trpc/vite.config.ts`, the integration suite in `test/vite.config.ts`;
`pnpm test` runs both.

### Shape

- Import from `vite-plus/test`: `import { describe, expect, it } from 'vite-plus/test'`.
- `it`, never `test` (`vitest/consistent-test-it`). Titles describe the behavior in a sentence.
- A table is **`it.each`**, never a loop around `it` (`vitest/prefer-each`).
- **`toStrictEqual` over `toEqual`** (`vitest/prefer-strict-equal`): `toEqual` ignores
  `undefined` properties and would let a codegen regression through. An equality matcher over
  `toBe(true)` on a comparison.
- `it.only`, `it.skip` and commented-out tests fail lint
  (`vitest/no-focused-tests`, `vitest/no-disabled-tests`, `vitest/no-commented-out-tests`).
- The package suite loads the OpenAPI parser, the TypeSpec compiler and ts-morph and writes real
  files, so its timeout is 30s (60s for `test/`, which also runs `tsc`): on a loaded machine the
  5s default is contention, not a hung test. Do not lower it.

### What tests may do that `src` may not

`*.test.ts` is exempt from the structural rules and the cast rules: `let`, `any`, type
assertions, arrow functions at module scope and cross-layer imports are fine when they spell the
fixture out most clearly. Two more are specific to this repository:

- **Tests run Effects directly** (`custom/no-effect-run` exempts them): provide
  `NodeServices.layer` and `Effect.runPromise`, or `Effect.runSync` for a pure decode. For a
  failure, `Effect.flip` and assert the tagged error (`{ _tag: 'ConfigError', message }`).
- Test files sit outside `tsconfig.json`, so type-aware lint sees a default lib without
  `toSorted`. `.sort()` on a fresh array is allowed there (`unicorn/no-array-sort` is off for
  tests only).

### Working with the filesystem

- A test that writes files creates its own directory (`mkdtempSync` under `os.tmpdir()`) and
  removes it afterwards (`afterEach` in the CLI suite). Pass absolute paths in the config or on
  the command line rather than changing the working directory.
- Assert through the observable result — files on disk, the generated source, the CLI's
  recorded output — rather than internals.
- A bugfix ships with a test that fails before it and passes after. When you add a guard, prove
  the test catches its absence (remove the guard, watch it fail, restore it).

### The CLI suite

- `runCli(argv)` in `src/cli/index.test.ts` runs the command the way the entry does — the
  arguments come from `Stdio`, supplied by `Stdio.layerTest` — and records stdout and stderr
  through a replaced `Console`, with the ANSI escapes stripped. Nothing reads `process.argv`.
- The CLI Reference block in `packages/openapi-to-trpc/README.md` is compared with `--help`;
  after changing a flag or an example, paste the new `--help` output into the README.
- The generator pipeline is loaded lazily; a test reads the CLI source to keep `config` and
  `core` out of its static imports.

### The integration suite (`test/`)

- `setup.ts` (Vitest `globalSetup`) generates `test/specs/openapi.yaml` for every validator
  library, each with a different component layout, and `test/specs/recursive.yaml` for the
  libraries that support recursive schemas, into `test/__generated__/`.
- It has to run first: Vite resolves a template-literal `import()` against the files that exist
  when the test file loads.
- `generate.test.ts` calls the generated routers through a tRPC caller
  (validation and the `NOT_IMPLEMENTED` stub) and runs `tsc` over everything generated.
- `__generated__/` is output: gitignored, refreshed every run, never edited or committed.
- A change to generated output is proven here for every library, not only zod: add the construct
  to a spec under `test/specs/` when it is new.

## Documentation

Three linters split the work and never overlap: **markdownlint** owns the document structure,
**textlint** the prose, **cspell** the individual words. All three run in `pnpm lint`;
`pnpm fix` autofixes markdownlint and textlint.

`packages/openapi-to-trpc/README.md` is the user documentation — install, CLI, the example, how
procedures are generated, the CLI reference and the full config reference — and it is what npm
shows. The root `README.md` is a **symlink** to it, so GitHub shows the same file. Edit the
package copy; never replace the symlink with a file. Links inside it are absolute
`https://github.com/...` URLs, because a relative link breaks on npm.

The `CLI Reference` block is `openapi-to-trpc --help` verbatim, in a `text` fence;
`src/cli/index.test.ts` fails when they differ.

### Structure (markdownlint)

- Every default rule is on. A rule that does not fit is turned off in
  `.markdownlint-cli2.jsonc` with the reason beside it — never left silently unset.
- The first line is the top-level heading.
- Ordered lists count `1.` `2.` `3.`.
- Duplicate headings are allowed only under different parents (`MD024` is `siblings_only`).
- **Every fenced block declares a language, from the closed list**: `ts`, `js`, `json`,
  `jsonc`, `yaml`, `bash`, `sh`, `text`, `diff`, `md`. Terminal output and directory trees are
  `text`. `typescript` is not in the list on purpose — one spelling per language.
- Line length is unchecked (a table row cannot wrap).

### Prose (textlint)

- The docs are English. The Japanese presets are deliberately absent, so do not add Japanese
  prose to a `.md` file.
- `terminology` enforces the canonical spelling of ~250 technical terms: **JavaScript**,
  **TypeScript**, **npm**, **GitHub**, **JSON**, **OpenAPI** (never `Open API`), **tRPC**
  (never `TRPC`), **TypeSpec**. Code spans and fenced blocks are skipped.
- `README` is excluded from the term list on purpose.
- Quotes, brackets and parentheses must balance (`no-unmatched-pair`).
- No `TODO` in the docs.
- A deliberate exception is a `<!-- textlint-disable rule-name -->` comment next to the sentence
  that needs it, never a change to `.textlintrc.yml`.

### Spelling (cspell)

- cspell reads **every** tracked file — source, tests, configs, workflows — not just the docs,
  in US English (`behavior`, `normalize`, `recognized`).
- A genuine project term (a package, tool or API name that recurs) is a one-line addition to
  `project-words.txt`, kept sorted. Never add a typo there, and never add `ignoreWords` or
  `ignorePaths` to `cspell.config.yaml` to silence a word.
- Deliberate non-words in test data (another language, a misspelling under test) are declared
  in that file only: `// cspell:ignore hellooo`, with a comment saying why.
- camelCase and snake_case are split automatically, and everything Git ignores is skipped.

## CI and configuration

### The workflows

Test, Lint and the two release workflows are hekireki's; Delete closed branch is the one wakusei runs, on `voidzero-dev/setup-vp`; PR title is truth's:

- `.github/workflows/test.yml` (Test): install → build → package tests → `test/` suite →
  `vp run check`. A new check is added to the root `package.json` scripts **and** reached from
  this workflow, so local and CI cannot disagree about what "clean" means. It also runs when
  started by hand (`workflow_dispatch`) and when `release.yml` calls it (`workflow_call`).
- `.github/workflows/lint.yml` (Lint): `vp run lint`, the gates that need no build.
- `.github/workflows/release-please.yml` (Release PR) opens the version bump pull request and
  merges it; `.github/workflows/release.yml` tags, publishes and releases. See Releasing.
- `.github/workflows/delete-closed-branch.yml` (Delete closed branch) deletes the head branch of
  a pull request closed without being merged; a merged one is deleted by the repository setting
  "Automatically delete head branches". It checks out nothing, skips forks, the default branch
  and a branch another open pull request is based on.
- `.github/workflows/pr-title.yml` (PR title) fails a pull request whose title is not
  `type(scope): summary` (see [Git policy](#git-policy)), because the title becomes the commit
  release-please reads. It reads the title from the event payload and is granted nothing.
- **Verify a change to the scripts, the workflows or the build in a fresh clone**, the way CI
  starts: `git clone . <tmp> && cd <tmp> && pnpm install --frozen-lockfile`, then the workflow's
  steps in order. The working copy carries gitignored output (`dist`, `test/__generated__`) that
  a checkout does not have.
- **Actions are pinned to a commit digest with the tag kept as a comment**:
  `uses: actions/checkout@3d3c42e5… # v7.0.1`. A floating tag is a mutable dependency with access
  to the job — never introduce one. Resolve a tag with
  `git ls-remote https://github.com/<owner>/<repo> 'refs/tags/<tag>^{}'`.
- `permissions` stays minimal (`contents: read`); a job that needs more says why beside them.
  Checkout uses `persist-credentials: false`, except the release job that pushes the tag.
- setup-vp puts `vp` on `PATH`, not `pnpm`: a step runs a root script as `vp run <script>`, which
  hands its pnpm to the script. Node is 24, which runs `scripts/*.ts` directly.
- actionlint (`scripts/actionlint.ts`) and zizmor (`scripts/zizmor.ts`) download a pinned release
  and verify its sha256. Bumping one means changing `VERSION` and **every checksum** together:
  actionlint's from the release's `*_checksums.txt`, zizmor's from each asset's `digest` in the
  GitHub releases API. Renovate cannot do it.
- A finding is excused next to the thing it is about, with the reason: an actionlint message in
  `.github/actionlint.yaml` scoped to one file, a zizmor audit in `.github/zizmor.yml` or an
  inline `# zizmor: ignore[audit]` comment. Never by dropping the check or the setting.
- `.github/zizmor.yml` excuses the tag job's checkout **by line and column**
  (`release.yml:83:9`). An edit above that line in `release.yml` moves it: update the entry in
  the same change, or zizmor fails.
- `pnpm lint:actions`, and so `pnpm check` and `pnpm fix`, runs zizmor offline, as the Lint
  workflow does. A shell that exports `GH_TOKEN` or `GITHUB_TOKEN` switches it to its online
  audits, which can fail on network access alone: run them with those unset
  (`env -u GH_TOKEN -u GITHUB_TOKEN pnpm check`).

### Editing the lint configuration

The `lint` block of `packages/openapi-to-trpc/vite.config.ts` is the standard this repository
holds itself to, and its comments explain the choices. `test/vite.config.ts` has a smaller lint
block of its own for the suite.

- Adding a rule: place it in the section it belongs to and, if the reason is not obvious from its
  name, write the reason above it. Then run `pnpm check` and fix what it reports in the code —
  the rule is not finished until the repository passes it.
- A rule that does not fit this codebase is **left out of the list**, with a comment where it
  would have gone saying why (as `unicorn/import-style` is). It is never set to `'off'` in
  `rules`.
- `'off'` appears only in `overrides`, scoped to the files it describes, with the reason.
- `categories` (correctness / suspicious / perf) are errors, so rules in those categories are not
  restated in `rules`.
- `plugins` replaces oxlint's defaults, so the defaults are restated there — do not drop one
  while adding another.
- A new `src/` directory gets its `no-restricted-imports` override (see the architecture rule).

### The oxlint plugin

`packages/openapi-to-trpc/lint/custom.js` is hono-takibi's plugin, as is: the Effect program
shape, function declarations, predicate and type naming. It is an oxlint JS plugin: untyped
ESTree in, a default export out. A change to it is better made in hono-takibi first and copied
here, so the two stay one standard. When a rule is added:

- Report a message that tells the author what to write instead, in the voice of the existing
  rules — a sentence, not a rule name.
- Exempt `*.test.ts` when the rule describes the shape of `src` rather than a real hazard.
- Add it to the header comment in `custom.js` and to `rules` in `vite.config.ts`.

### Formatting and the other linters

- Formatting options live **only** in the root `vite.config.ts` (`fmt`); every workspace
  inherits them. Do not add `fmt.ignorePatterns` there — they are inherited too. The same style
  is duplicated in `emit` in `src/core/index.ts`, because generated code is formatted at
  runtime; change both together.
- `cspell.config.yaml`, `.textlintrc.yml` and `.markdownlint-cli2.jsonc` explain themselves in
  comments; the docs rule says how to live with them.

### Dependencies

- `pnpm-lock.yaml` is written by pnpm. Never edit it by hand, and never delete it to "fix" an
  install. CI installs with `--frozen-lockfile`.
- **`effect` and `@effect/platform-node` share one caret range (`^4.0.6`) and move together.**
  `@effect/platform-node` depends on `@effect/platform-node-shared` with a caret range, which
  floats to the newest release, and each one peers the matching `effect`. Pinning `effect`
  exactly (as hono-takibi does) therefore lets a fresh install combine two releases — it did
  here on the release candidates: `@effect/platform-node-shared` rc.114 next to `effect` rc.112
  failed with `Cannot find module .../effect/dist/ByteSize.js`. With both on a caret range the
  resolver picks one matching set. (schema-truth, under oas-truth, pins `effect` 4.0.5 exactly
  and gets its own copy; `pnpm peers check` reports that pair, which is not this package's.) A
  bump still changes behavior now and then, so it is a change of its own — see the playbook.
- pnpm holds a release back for a day (`minimumReleaseAge`). When it would let only part of an
  Effect set through, the newest set is listed together under `minimumReleaseAgeExclude` in
  `pnpm-workspace.yaml`, as `oas-truth@0.5.1` and `schema-truth@0.7.0` are. Remove an entry
  once the release is older than a day.
- `@apidevtools/swagger-parser`, `@typespec/compiler` and `@typespec/openapi3` are peers of
  oas-truth, which npm and pnpm install automatically. Nothing here imports them, so they are not
  dependencies of the package.
- The package's runtime `dependencies` are what every user installs. Adding one is a design
  decision — ask first. Tooling goes in `devDependencies` of the workspace that uses it; the
  repository-wide linters are root `devDependencies`, pinned exactly.
- Renovate (`renovate.json`) opens update PRs on Saturdays (Asia/Tokyo), after a release has
  been out for 7 days (1 day for a security fix), and refreshes the lockfile on the same day.
  The `effect` group keeps the Effect packages in one PR, `prose linters` the documentation
  toolchain.
- Renovate merges pins, the lockfile refresh and minor or patch updates of dependencies at 1.0
  or later on its own once CI passes. Majors, `0.x` dependencies
  (`oas-truth`, `oxfmt`, `vite-plus`) and a new digest under an unchanged action tag wait for a
  review. So does the
  `effect` group: a patch has changed Schema behavior and `--help` here, so that PR is finished
  by hand with the Bump effect playbook. The rule excluding it sits last in
  `packageRules`, because a later rule overrides an earlier one.
- Renovate titles its PRs as Conventional Commits
  (`semanticCommits`, with the `:semanticPrefixFixDepsChoreOthers` preset of `config:recommended`):
  an update of runtime
  `dependencies` is `fix(deps): …`, so merging one for `packages/openapi-to-trpc` releases a patch,
  and everything else is `chore(deps): …` and releases nothing. Retitle a PR before merging when
  its type understates the change: an update that changes the generated output is released for
  what it changes for users (`feat`, or `!` when it breaks them).

### The published package

- `files: ["dist"]`, plus the `README.md` npm always includes. The README is a real file in
  `packages/openapi-to-trpc` because npm leaves symlinks out; the root `README.md` is the
  symlink. `LICENSE` lives at the root only, as in hono-takibi and hekireki.
- There are no lifecycle scripts: `npm publish` does not build, so the release workflow's
  publish job builds right before it.
- Installing the packed tarball with npm into an empty directory is the proof it works for a
  user: `npm pack`, `npm install ./openapi-to-trpc-<version>.tgz`, then run the CLI. Do it after
  any change to `package.json`, `pack` in `vite.config.ts`, the dependencies or the entry points.

### Releasing

Releases are CI's job, worked out from the Conventional Commits merged into `main` (the Git
policy of the project rule). Nobody bumps the version or approves a release; hekireki releases
the same way.

1. **`release-please.yml` (Release PR)** runs on every push to `main`. release-please reads the
   commits since the last GitHub Release that change something under `packages/openapi-to-trpc`
   (`release-please-config.json`, counting from the version in `.release-please-manifest.json`)
   and, when one is a `feat`, `fix` or `perf`, opens `chore: bump version to x.y.z`, which
   changes `version` in `packages/openapi-to-trpc/package.json` and the manifest. The same job
   squash-merges that pull request with the workflow's token and starts `release.yml` on `main`.
2. **`release.yml`** runs after Test passes on a push to `main`, or when started directly, where
   its `test` job calls Test first: a merge made with the workflow's token starts no Test. From
   that exact commit:
   1. **check** — reads the version and asks npm whether it is published;
   2. **tag** — creates `v<version>` on that commit, or verifies it is already there;
   3. **publish** — only when npm does not have the version: build, then
      `pnpm -F openapi-to-trpc publish` with npm provenance (environment `release`,
      `id-token: write`);
   4. **release** — creates the GitHub release for the tag with generated notes.

- `release.yml` writes the Release, not release-please (`skip-github-release`), so release-please
  never relabels its merged pull request from `autorelease: pending` to `autorelease: tagged`, and
  opens no new one while a pending one is left. The first step of the Release PR job relabels it
  once a Release at or above its version exists. A bump whose release failed therefore holds
  back the next one: finish that release first.
- **Never publish by hand, never create or move a `v*` tag by hand, and never bump `version` by
  hand.** Never reuse or roll back a published version: a `fix` merged after a bad release
  releases the next patch.
- If publish fails (an npm outage, a missing trusted publisher), fix the cause and re-run the
  failed jobs; the tag already points at the right commit.
- When `release.yml` asks for a new version (a published version without its tag, a tag on
  another commit), bump `version` in `packages/openapi-to-trpc/package.json` **and** in
  `.release-please-manifest.json`, in one commit (`chore: bump version to x.y.z`) pushed to
  `main`. release-please counts from the manifest, so bumping only the package has it propose
  the same version again.
- Configured once, outside the repository: Actions may create and approve pull requests
  (Settings → Actions → General → Workflow permissions); squash merging takes the pull request
  title as its default commit message; no branch protection or ruleset on `main` requires a review
  or a status check that the bump pull request cannot get (no workflow runs on it); and on npm, a
  trusted publisher on the package's access page for this repository, workflow `release.yml`,
  environment `release`. The `release` environment only deploys from `main` (Settings →
  Environments → `release` → Deployment branches), so no other branch can reach the trusted
  publisher. "Automatically delete head branches" is on. The Issue loop, a Claude Code scheduled
  task, starts when the owner opens an issue and runs on no timer; it takes only the owner's
  issues and skips one labelled `question`, which waits on the owner (one of GitHub's default
  labels).

## Playbooks

Every playbook ends the same way: `pnpm fix`, then `pnpm check` and `pnpm test`, all green, then
commit when asked.

### Add a config option

1. Write the failing test first: `src/config/index.test.ts` for validation, and
   `src/core/index.test.ts` or `src/cli/index.test.ts` for what it changes.
2. Add the field to `ConfigSchema` in `src/config/index.ts`, with its default as
   `Schema.withDecodingDefault`, an `annotate({ title, description, examples })`, and a check
   whose message names the field. A rule across fields is a `Schema.makeFilter`.
3. Thread it through `makeFiles` in `src/core/index.ts` into the pure builders in `generator/`,
   respecting the layering.
4. If it should be reachable without a config file, add the flag to `commandLine` in
   `src/cli/index.ts` and paste the new `--help` into the README.
5. Document it in `packages/openapi-to-trpc/README.md` (`Full Config Reference`).

### Support an OpenAPI construct in the routers

1. Add the construct to a spec under `test/specs/` (or a new one) so every library generates it.
2. Build it in `src/generator/router.ts` as a JSON Schema handed to the oas-truth adapter, not as
   library-specific code: the adapter writes zod, valibot, arktype and Effect Schema from it.
3. Only what the adapter leaves to the host goes in `src/generator/library.ts` (the Standard
   Schema wrapper and the import probe), per library. What the adapter cannot express yet is a
   feature request at nakita628/truth (Fix a generator bug, step 4), not code here.
4. `pnpm test` proves the result type-checks with `tsc` and validates at runtime for every
   library. Add a runtime assertion to `test/generate.test.ts` when the behavior is new.

### Fix a generator bug

1. Reproduce it as a failing test at the smallest document that shows it. Prefer asserting the
   behavior of the generated code (`test/generate.test.ts` calls the routers through a tRPC
   caller) over string matching.
2. Find the layer that owns the mistake — oas-truth or schema-truth (parsing, the zod / valibot /
   arktype / Effect Schema code the adapter writes, the component generators), a builder in
   `generator/`, the merge, or the program in `core/` — and fix it there, not downstream. When it
   is oas-truth or schema-truth, nothing changes here: follow step 4.
3. Check whether the other validator libraries and component layouts have the same mistake.
4. A mistake in oas-truth or schema-truth is fixed in
   [nakita628/truth](https://github.com/nakita628/truth), never worked around here:
   1. Run the reproduction against the newest oas-truth on npm first. If a release already fixes
      it, the change here is the Bump oas-truth playbook.
   2. Look through the open issues there, and add to one that reports the same problem rather
      than opening another.
   3. Otherwise open one in English from its bug report template (`fix: …`; a construct the
      adapter cannot express is its feature request template, `feat: …`): the smallest OpenAPI
      document, the output it writes, the output expected, and the oas-truth and schema-truth
      versions. Without access to nakita628/truth, write the issue out in the issue here for
      the owner to file.
   4. Link it from the issue or pull request here, which stays open until an oas-truth release
      has the fix. The failing test from step 1 lands with that update.

### Port a feature from hono-takibi

1. Read the whole hono-takibi implementation and its tests before writing anything.
2. List what differs here: tRPC instead of Hono, router files that merge into the user's code,
   oas-truth doing the parsing and the adapters. Adapt; do not copy a behavior that would delete
   or overwrite user code.
3. Port the tests first and make sure the new ones fail against the current code before the
   implementation lands.
4. Say in the commit body what was taken as-is and what was changed and why.

### Clear a lint failure

1. Run the failing command and read the rule name in the message.
2. Try `pnpm fix` first — formatting, import order, markdownlint and textlint are autofixable.
3. Otherwise **change the code, not the rule.** The rules encode the design: no assertion means
   narrow with a guard; a `no-restricted-imports` message means the dependency direction is
   wrong; `prefer-each` means `it.each`; `no-await-in-loop` means run the work together.
4. Only if the rule genuinely cannot hold, add
   `// oxlint-disable-next-line rule-name -- reason` on that line, and say in the report that you
   added a suppression and why.
5. An unknown word is one line in `project-words.txt` if it is a real project term, a file-local
   `cspell:ignore` if it is test data, and a rename if it is an abbreviation or a typo.

### Add a linter rule

1. Check its category; correctness / suspicious / perf are already on.
2. Add it to the `lint` block of `packages/openapi-to-trpc/vite.config.ts` in its section, with
   the reason.
3. Run `pnpm check` and fix every finding in the code.
4. For a `custom/` rule, follow the plugin section of the CI and configuration rule.

### Bump effect

Renovate's `effect` PR is never merged automatically, and it only rewrites the lockfile. Check
out its branch and follow the same steps.

1. Update `effect` and `@effect/platform-node` together (`pnpm up -r effect @effect/platform-node
   @effect/platform-node-shared`), then put both specs back to one caret range — `pnpm up`
   rewrites them to exact versions.
2. If pnpm's release-age gate holds back part of the set, list the whole set under
   `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` rather than mixing two releases.
3. `pnpm check` and `pnpm test`. Even a patch has changed behavior here
   (4.0.6 let a filter's `message` annotation replace the message the filter returns, and added completion shells to `--help`),
   so expect failures in `config/` and `cli/` first; paste a new `--help` into the
   README.
4. `pnpm test`, then install the packed tarball with npm and run the CLI.
5. Report which upstream changes forced code changes; that is what the commit body explains.

### Bump oas-truth

1. Read its changelog and its type declarations: a new export may replace code here.
2. Update it, then `pnpm check` and `pnpm test`. The integration suite shows any change in the
   generated code for every library; read the difference rather than adjusting an assertion. If
   pnpm's one-day release-age gate holds the new release back, list it under
   `minimumReleaseAgeExclude`, as the CI rule says.
3. Remove what oas-truth now provides, and the tests that only covered it.
4. Close the issues here that waited for this release (Fix a generator bug, step 4): their
   failing tests land in the same change, with `Closes #<number>`.

### Release

Merging is releasing, and nothing here bumps the version: a pull request titled `feat`, `fix` or
`perf` that changes `packages/openapi-to-trpc` is released once it reaches `main`.

1. Title the pull request for the release it makes (the Git policy of the project rule). A
   breaking change to the config, the CLI or the generated output carries `!`, and is a minor
   bump while the version is `0.x`.
2. After the merge, watch Release PR: it opens and merges `chore: bump version to x.y.z`, then
   starts `release`, which runs Test, tags `v<version>`, publishes to npm and creates the GitHub
   release from that commit. Never publish, tag or bump by hand.
3. If a job fails, fix the cause and re-run the failed jobs. To fix a published release, merge
   the `fix` — never reuse a version.
4. Only when `release.yml` asks for a new version, bump `version` in
   `packages/openapi-to-trpc/package.json` and `.release-please-manifest.json` together, as the
   Releasing section of the CI rule says.

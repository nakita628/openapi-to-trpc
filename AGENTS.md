# AGENTS.md

Instructions for coding agents working on this repository. The full rules live in
[`.cursor/rules/`](.cursor/rules) and are also read automatically by Cursor:

| Rule               | Applies to                         | Covers                                                                    |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------- |
| `project.mdc`      | always                             | repository map, commands, invariants, definition of done, Git             |
| `typescript.mdc`   | `**/*.ts`                          | the code conventions the oxlint configuration enforces                    |
| `effect.mdc`       | `packages/openapi-to-trpc/src/**`  | the Effect program shape, errors, services and the config schema          |
| `architecture.mdc` | `packages/openapi-to-trpc/src/**`  | layering, what comes from oas-truth, user code in the routers, public API |
| `testing.mdc`      | `**/*.test.ts`, `test/**`          | Vitest conventions, the CLI suite and the integration suite               |
| `docs.mdc`         | `**/*.md`                          | markdownlint, textlint and cspell                                         |
| `ci-config.mdc`    | workflows, manifests, lint configs | action pinning, editing the lint config, dependencies, release            |
| `playbooks.mdc`    | on request                         | step-by-step recipes for the recurring tasks                              |

## The short version

```bash
pnpm install --frozen-lockfile
pnpm fix     # formatting, oxlint, markdownlint and textlint autofixes
pnpm check   # format check, oxlint and type checks, then every linter
pnpm test    # the package suite, then the generated routers of every validator library
```

`pnpm check` and `pnpm test` must pass before a change is finished — they are what CI runs.
Never relax a linter to get a change through, never delete or overwrite the code users keep in
the generated router files, and write everything committed in English.

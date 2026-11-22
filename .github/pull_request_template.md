<!--
Title: `type(scope): summary` (Conventional Commits), imperative mood, no trailing period. Write
it for the person reading the release notes, not for the diff. main takes squash merges, so the
title becomes the commit, and release-please reads it to release: `feat` raises the minor version,
`fix` and `perf` the patch, `!` before the colon marks a breaking change (the minor while the
version is 0.x), and the other types release nothing. Only a change under
packages/openapi-to-trpc is released.

  type   feat | fix | perf | refactor | docs | test | build | ci | chore
  scope  router | components | types | client | merge | cli | config | example | deps

  fix(merge): keep middleware on a procedure when regenerating a router
  feat(cli): print the files a run wrote
-->

<!-- A pull request body has no top-level heading: GitHub shows the title above it. -->
<!-- markdownlint-disable MD041 -->

## Why

<!-- The bug, the missing capability or the request behind this change. Link the issue: `Closes #123`. -->

## What

<!-- What changed, as someone running the CLI or reading the generated code sees it. One to three sentences. -->

## Where

<!-- Scope: the routers (procedures, input, output), the component schemas, the other components, the router types, the router merge, the CLI, the config. Name what is deliberately left out. -->

## Who

<!-- Who notices: every user, users of one validator library (zod, valibot, arktype, effect), contributors only. Breaking for anyone? -->

## When

<!-- Release impact, as the title's type decides it: `none` | `patch` | `minor` | `breaking`. The version is bumped by the release-please pull request, not here. -->

## How

<!--
The approach in a sentence, then the evidence. For a generator change, the spec and the
output it now writes — `test/__generated__` is not committed, so paste the lines that changed
or add the construct to a spec under `test/specs`. Tick only what you ran; paste the output of
anything that failed.
-->

<!-- The boxes are ticked by the author, not parked work. -->
<!-- textlint-disable no-todo -->

- [ ] `pnpm check`
- [ ] `pnpm test`

<!-- textlint-enable no-todo -->

<!--
Title: an imperative sentence, no `feat:` / `fix:` prefix, no trailing period — the shape of the
commit history. Write it for the person reading the release notes, not for the diff.

  Keep middleware on a procedure when regenerating a router
  Print the files a run wrote
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

<!-- Release impact: `none` | `next release` | `version bumped to x.y.z`. -->

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

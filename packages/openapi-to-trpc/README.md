# openapi-to-trpc

```bash
npm install -D openapi-to-trpc
```

## OpenAPI to tRPC Code Generator

**openapi-to-trpc** generates type-safe [tRPC](https://trpc.io/) routers from [OpenAPI](https://www.openapis.org/) / [TypeSpec](https://typespec.io/) specifications. Parsing and validator code generation come from [oas-truth](https://www.npmjs.com/package/oas-truth).

- OpenAPI schemas to validators (`zod` | `valibot` | `arktype` | `effect`)
- One tRPC router per resource (first path segment) plus an `appRouter`
- Component output as one file, one file per kind, or one file per entry
- Router type helpers (`RouterInputs` / `RouterOutputs`)
- A typed tRPC client (`createTRPCClient<typeof appRouter>`)
- Regeneration keeps your implemented resolvers

## Quick Start

### CLI

```bash
npx openapi-to-trpc openapi.yaml
```

Routers are written to `src/routes/`, component schemas to `src/components/index.ts` (next to the router directory). `-s` picks the validator library and `-o` the router directory; everything else is a config file's job.

### Configuration File

Create `openapi-to-trpc.config.ts`:

```ts
import { defineConfig } from 'openapi-to-trpc'

export default defineConfig({
  input: 'openapi.yaml',
  schema: 'zod',
})
```

```bash
npx openapi-to-trpc
```

### Example

input:

```yaml
openapi: 3.1.0
info:
  title: API
  version: '1.0.0'
paths:
  /users/{userId}:
    get:
      summary: Get a user
      parameters:
        - name: userId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
      required:
        - id
        - name
```

output:

```ts
// src/components/index.ts
import * as z from 'zod'

export const UserSchema = z.object({ id: z.uuid(), name: z.string() })

export type UserSchema = z.infer<typeof UserSchema>
```

```ts
// src/routes/users.ts
import { initTRPC, TRPCError } from '@trpc/server'
import * as z from 'zod'

import { UserSchema } from '../components'

const t = initTRPC.create()

export const usersRouter = t.router({
  getUsersUserId: t.procedure
    .input(z.object({ userId: z.uuid() }))
    .output(UserSchema)
    .query(() => {
      throw new TRPCError({ code: 'NOT_IMPLEMENTED' })
    }),
})
```

```ts
// src/routes/index.ts
import { initTRPC } from '@trpc/server'

import { usersRouter } from './users'

const t = initTRPC.create()

export const appRouter = t.router({ users: usersRouter })
```

### Procedures

- `GET` becomes a `query`, every other method a `mutation`; the procedure is named `<method><Path>` (`getUsersUserId`).
- The input merges path and query parameters with the JSON request body. An object body is flattened next to the parameters; any other body goes under `body`. Header and cookie parameters are left to your tRPC context.
- The output is the first `2xx` JSON response.
- Each resolver starts as a `NOT_IMPLEMENTED` stub. Replace it with your implementation, and build the procedure on your own middleware (`authed.input(…)`) where you need it. On the next run only what the document owns is regenerated: each procedure's `.input()` / `.output()`, the generator's imports and a stub for each new operation; a procedure whose operation left the document is removed. Your resolvers, the procedures they build on, `.use()` / `.meta()`, comments, other entries of the router, your imports of other modules and any other code in the file (a customized `initTRPC`, helpers) are kept.

## CLI Reference

`openapi-to-trpc --help`:

```text
DESCRIPTION
  Generate tRPC routers from OpenAPI or TypeSpec

USAGE
  openapi-to-trpc [flags] [<input>]

ARGUMENTS
  input input.{yaml,json,tsp} OpenAPI (.yaml, .json) or TypeSpec (.tsp) document to generate from (optional)

FLAGS
  --output, -o dir        Router directory for <input> (default: src/routes)
  --schema, -s library    Validator library for <input> (default: zod) (choices: zod, valibot, arktype, effect)
  --config, -c file       Config file to run (default: ./openapi-to-trpc.config.ts)

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|powershell|sh|pwsh>                    Print shell completion script (choices: bash, zsh, fish, powershell, sh, pwsh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)

EXAMPLES
  # Generate routers into src/routes and schemas into src/components
  openapi-to-trpc openapi.yaml

  # Pick the validator library and the router directory
  openapi-to-trpc openapi.yaml -s valibot -o server/routers

  # Run ./openapi-to-trpc.config.ts
  openapi-to-trpc

  # Run a config file from another location
  openapi-to-trpc --config config/trpc.config.ts
```

With an `<input>` the CLI generates from that document; without one it runs a config file — `--config`, or `./openapi-to-trpc.config.ts`. The two are mutually exclusive.

## Full Config Reference

```ts
// openapi-to-trpc.config.ts
import { defineConfig } from 'openapi-to-trpc'

export default defineConfig({
  // OpenAPI spec file (.yaml, .json, or .tsp)
  input: 'openapi.yaml',

  // Validator library
  schema: 'zod', // 'zod' | 'valibot' | 'arktype' | 'effect'

  // tRPC router directory
  output: 'src/routes',

  // `as const` on the data components (responses, examples, links, ...)
  readonly: false,

  // Import prefix the generated files use for one another instead of relative paths, where the
  // tsconfig maps `@/*` to the directory that holds the router directory (`src` here)
  // pathAlias: '@/',

  // oxfmt options for the generated code
  // format: { printWidth: 100 },

  // Components (OpenAPI Components Object). Either every section into one file:
  // components: { output: 'src/components.ts' },
  // components: { output: 'packages/components/src/index.ts', package: '@packages/components' },
  //
  // or each section into its own output: a `.ts` file, or a directory — one file per entry plus
  // an index.ts barrel with `split: true`, its index.ts without. Schemas default to
  // components/index.ts next to the router directory; the other sections are only written when
  // configured. `exportTypes` adds the inferred types to the sections whose entries are
  // validators: schemas (on by default), parameters, headers and mediaTypes (OpenAPI 3.2).
  // A generated file imports another one relatively inside its package (under `pathAlias` when
  // it is set), and by that output's `package` from another package; a package is what the
  // nearest package.json delimits. An output another package imports must name its `package`.
  components: {
    schemas: { output: 'src/components/schemas', split: true, exportTypes: true },
    responses: { output: 'src/components/responses.ts' },
    // parameters: { output: 'packages/parameters/src/index.ts', package: '@packages/parameters' },
    parameters: { output: 'src/components/parameters.ts', exportTypes: true },
    examples: { output: 'src/components/examples.ts' },
    requestBodies: { output: 'src/components/requestBodies.ts' },
    headers: { output: 'src/components/headers.ts' },
    securitySchemes: { output: 'src/components/securitySchemes.ts' },
    links: { output: 'src/components/links.ts' },
    callbacks: { output: 'src/components/callbacks.ts' },
    pathItems: { output: 'src/components/pathItems.ts' },
    mediaTypes: { output: 'src/components/mediaTypes.ts' },
  },

  // Router type helpers (`RouterInputs` / `RouterOutputs`)
  type: { output: 'src/types.ts' },

  // Typed tRPC client, see below
  client: { output: 'src/client.ts', baseUrl: '/trpc' },
})
```

Recursive schemas (self or mutual `$ref` cycles) are supported for every validator library.

## Client

A `client` block generates the tRPC client of the `appRouter`; you never create one.

```ts
export default defineConfig({
  input: 'openapi.yaml',
  client: { output: 'src/client.ts', baseUrl: '/trpc' },
})
```

```ts
// src/client.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client'

import type { appRouter } from './routes'

export const client = createTRPCClient<typeof appRouter>({
  links: [httpBatchLink({ url: '/trpc' })],
})
```

Then call `client.users.getUsersUserId.query({ userId })`. Only the type of the router is imported, so no server code reaches the client bundle. The file is rewritten on every run.

| Option               | Sets                     | Meaning                                                 |
| -------------------- | ------------------------ | ------------------------------------------------------- |
| `client.output`      | the file                 | A `.ts` file.                                           |
| `client.baseUrl`     | `httpBatchLink({ url })` | Where the tRPC handler is mounted, see below.           |
| `client.import`      | `from './routes'`        | Where the router type comes from. Only across packages. |
| `client.credentials` | `fetch` of the link      | Send cookies with every request, see below.             |

### Base URL

`'/'` by default. A same-origin path (`'/trpc'`, `'/api/trpc'`) is written into the file; an absolute URL differs between environments, so it comes from the environment, with no fallback:

| `baseUrl`                                   | Generated                       |
| ------------------------------------------- | ------------------------------- |
| `'/trpc'`                                   | `'/trpc'`                       |
| `{ env: 'VITE_API_URL' }`                   | `import.meta.env.VITE_API_URL!` |
| `{ env: 'API_URL', source: 'process.env' }` | `process.env.API_URL!`          |
| `{ env: 'API_URL', import: '@/env' }`       | `env.API_URL` from `@/env`      |

With `import`, the export is `env` unless `name` says otherwise:

```ts
baseUrl: { env: 'API_URL', import: '../config', name: 'config' } // config.API_URL
```

### Cookies

A client of an API on another origin needs `credentials: 'include'` to send its cookies. `client.credentials` writes it into the link's `fetch`, as the [tRPC guide](https://trpc.io/docs/client/cors) does:

```ts
client: { output: 'src/client.ts', credentials: 'include' }
```

```ts
httpBatchLink({
  url: '/',
  fetch: (input, { signal, ...init } = {}) =>
    fetch(input, { ...init, ...(signal && { signal }), credentials: 'include' }),
})
```

It is the `credentials` of `fetch` — `'include'`, `'same-origin'` or `'omit'` — and nothing is written when it is left out.

## Example

[`apps/todo`](https://github.com/nakita628/openapi-to-trpc/tree/main/apps/todo) is a todo API generated from an OpenAPI document: routers with hand-written resolvers, a tRPC server and the generated client, with tests.

## Contributing

If you find an issue with the generated code or have a suggestion, open an issue at [GitHub Issues](https://github.com/nakita628/openapi-to-trpc/issues) or send a pull request.

Lint and tests run from the repository root:

```bash
pnpm check   # vp fmt, oxlint and type checks per workspace, then `pnpm lint`
pnpm lint    # markdownlint, textlint, cspell, secretlint, then actionlint and zizmor
pnpm test    # unit tests, the generated routers of every validator library, then apps/todo
pnpm build   # packs packages/openapi-to-trpc into dist
```

actionlint and zizmor are not npm packages: `scripts/actionlint.ts` and `scripts/zizmor.ts` download the pinned release for your platform once, verify its checksum and cache it under `node_modules/.cache`.

## License

Distributed under the MIT License. See [LICENSE](https://github.com/nakita628/openapi-to-trpc?tab=MIT-1-ov-file) for more information.

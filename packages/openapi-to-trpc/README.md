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
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
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

  // oxfmt options for the generated code
  // format: { printWidth: 100 },

  // Components (OpenAPI Components Object). Either every kind into one file:
  // components: { output: 'src/components.ts' },
  //
  // or each kind into its own output. `split: true` makes `output` a directory with one file
  // per entry plus an index.ts barrel. `exportTypes: true` adds inferred types to parameters
  // and headers (schemas always export theirs). Schemas default to components/index.ts next
  // to the router directory; the other kinds are only written when configured.
  components: {
    schemas: { output: 'src/components/schemas', split: true },
    parameters: { output: 'src/components/parameters.ts', exportTypes: true },
    headers: { output: 'src/components/headers.ts' },
    responses: { output: 'src/components/responses.ts' },
    requestBodies: { output: 'src/components/requestBodies.ts' },
    examples: { output: 'src/components/examples.ts' },
    securitySchemes: { output: 'src/components/securitySchemes.ts' },
    links: { output: 'src/components/links.ts' },
    callbacks: { output: 'src/components/callbacks.ts' },
    pathItems: { output: 'src/components/pathItems.ts' },
  },

  // Router type helpers (`RouterInputs` / `RouterOutputs`)
  type: { output: 'src/types.ts' },
})
```

Recursive schemas (self or mutual `$ref` cycles) are supported for every validator library.

## Setting up the tRPC client

The client is yours to create — the URL, headers, transformer and `fetch` are runtime concerns:

```ts
// src/client.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { appRouter } from './routes'

export const client = createTRPCClient<typeof appRouter>({
  links: [httpBatchLink({ url: '/api/trpc' })],
})
```

Use `import type` so server code never reaches the client bundle, then call `client.users.getUsersUserId.query({ userId })`.

## Contributing

If you find an issue with the generated code or have a suggestion, open an issue at [GitHub Issues](https://github.com/nakita628/openapi-to-trpc/issues) or send a pull request.

Lint and tests run from the repository root:

```bash
pnpm check   # vp fmt, oxlint and type checks per workspace, then `pnpm lint`
pnpm lint    # markdownlint, textlint, cspell, secretlint, then actionlint and zizmor
pnpm test    # unit tests, then the generated routers of every validator library
pnpm build   # packs packages/openapi-to-trpc into dist
```

actionlint and zizmor are not npm packages: `scripts/actionlint.ts` and `scripts/zizmor.ts` download the pinned release for your platform once, verify its checksum and cache it under `node_modules/.cache`.

## License

Distributed under the MIT License. See [LICENSE](https://github.com/nakita628/openapi-to-trpc?tab=MIT-1-ov-file) for more information.

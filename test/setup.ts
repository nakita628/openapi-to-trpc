import fs from 'node:fs'
import path from 'node:path'

import * as NodeServices from '@effect/platform-node/NodeServices'
import { Effect } from 'effect'

import { parseConfig } from '../packages/openapi-to-trpc/src/config/index.js'
import { openapiToTrpc } from '../packages/openapi-to-trpc/src/core/index.js'

export const OUT = path.join(import.meta.dirname, '__generated__')

// One component layout and one client per library, so every output mode and every way of
// reading the base URL is type-checked against a real validator. The zod client is called over
// HTTP by the suite, which sets API_URL.
const LAYOUTS = {
  zod: {
    components: { output: 'components.ts' },
    client: { baseUrl: { env: 'API_URL', source: 'process.env' }, credentials: 'include' },
  },
  valibot: {
    components: {
      schemas: { output: 'components/schemas', split: true },
      responses: { output: 'components/responses', split: true },
      parameters: { output: 'components/parameters.ts', exportTypes: true },
    },
    client: {},
  },
  arktype: {
    components: { schemas: { output: 'schemas.ts' } },
    client: { baseUrl: { env: 'API_URL', import: './env' } },
  },
  effect: {
    components: { schemas: { output: 'components' } },
    client: { baseUrl: { env: 'VITE_API_URL' } },
  },
}

// What the arktype and effect clients read the base URL from: an environment module of the
// user's, and the `import.meta.env` a bundler such as Vite types.
const ENVIRONMENT: { readonly [schema: string]: readonly [file: string, code: string] } = {
  arktype: ['env.ts', "export const env = { API_URL: 'http://localhost/trpc' }\n"],
  effect: [
    'vite-env.d.ts',
    'interface ImportMeta {\n  readonly env: { readonly VITE_API_URL?: string }\n}\n',
  ],
}

/** Generates one layout; a failure rejects with the config or generator error. */
export function generate(
  spec: string,
  schema: string,
  root: string,
  components: object,
  client?: object,
) {
  fs.rmSync(root, { recursive: true, force: true })
  const program = Effect.gen(function* () {
    const config = yield* parseConfig({
      input: path.join(import.meta.dirname, 'specs', spec),
      schema,
      output: path.join(root, 'routes'),
      components: Object.fromEntries(
        Object.entries(components).map(([kind, value]: [string, string | { output: string }]) => [
          kind,
          typeof value === 'string'
            ? path.join(root, value)
            : { ...value, output: path.join(root, value.output) },
        ]),
      ),
      type: { output: path.join(root, 'types.ts') },
      ...(client && { client: { ...client, output: path.join(root, 'client.ts') } }),
    })
    return yield* openapiToTrpc(config)
  })
  return Effect.runPromise(program.pipe(Effect.provide(NodeServices.layer)))
}

/**
 * Regenerates __generated__ before the suite: specs/openapi.yaml for every library with its own
 * layout, and specs/recursive.yaml for every library.
 */
// oxlint-disable-next-line import/no-default-export -- Vitest resolves a global setup through its default export
export default async function setup() {
  fs.rmSync(OUT, { recursive: true, force: true })
  await Promise.all([
    ...Object.entries(LAYOUTS).map(async ([schema, { components, client }]) => {
      const root = path.join(OUT, schema)
      await generate('openapi.yaml', schema, root, components, client)
      const environment = ENVIRONMENT[schema]
      if (environment) fs.writeFileSync(path.join(root, environment[0]), environment[1])
    }),
    ...['zod', 'valibot', 'arktype', 'effect'].map((schema) =>
      generate('recursive.yaml', schema, path.join(OUT, 'recursive', schema), {
        output: 'components.ts',
      }),
    ),
  ])
}

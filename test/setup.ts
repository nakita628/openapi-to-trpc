import fs from 'node:fs'
import path from 'node:path'

import * as NodeServices from '@effect/platform-node/NodeServices'
import { Effect } from 'effect'

import { parseConfig } from '../packages/openapi-to-trpc/src/config/index.js'
import { openapiToTrpc } from '../packages/openapi-to-trpc/src/core/index.js'

export const OUT = path.join(import.meta.dirname, '__generated__')

// One component layout per library, so every output mode is type-checked against a real validator.
const LAYOUTS = {
  zod: { output: 'components.ts' },
  valibot: {
    schemas: { output: 'components/schemas', split: true },
    responses: { output: 'components/responses', split: true },
    parameters: { output: 'components/parameters.ts', exportTypes: true },
  },
  arktype: { schemas: { output: 'schemas.ts' } },
  effect: { schemas: { output: 'components' } },
}

/** Generates one layout; a failure rejects with the config or generator error. */
export function generate(spec: string, schema: string, root: string, components: object) {
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
    })
    return yield* openapiToTrpc(config)
  })
  return Effect.runPromise(program.pipe(Effect.provide(NodeServices.layer)))
}

/**
 * Regenerates __generated__ before the suite: specs/openapi.yaml for every library with its own
 * layout, and specs/recursive.yaml for the libraries that support recursive schemas.
 */
// oxlint-disable-next-line import/no-default-export -- Vitest resolves a global setup through its default export
export default async function setup() {
  fs.rmSync(OUT, { recursive: true, force: true })
  await Promise.all([
    ...Object.entries(LAYOUTS).map(([schema, components]) =>
      generate('openapi.yaml', schema, path.join(OUT, schema), components),
    ),
    ...['zod', 'valibot', 'effect'].map((schema) =>
      generate('recursive.yaml', schema, path.join(OUT, 'recursive', schema), {
        output: 'components.ts',
      }),
    ),
  ])
}

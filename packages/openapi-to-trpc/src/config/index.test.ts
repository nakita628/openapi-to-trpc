import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { parseConfig } from './index.js'

describe('parseConfig', () => {
  it('fills in defaults and normalizes component outputs to files', () => {
    expect(
      Effect.runSync(
        parseConfig({
          input: 'openapi.yaml',
          components: {
            schemas: { output: 'src/schemas' },
            responses: { output: 'src/responses', split: true },
          },
        }),
      ),
    ).toStrictEqual({
      input: 'openapi.yaml',
      schema: 'zod',
      output: 'src/routes',
      readonly: false,
      components: {
        schemas: { output: 'src/schemas/index.ts', split: false, exportTypes: false },
        responses: { output: 'src/responses', split: true, exportTypes: false },
      },
    })
  })

  it.each([
    [{ input: 'openapi.txt' }, 'input: must be .yaml | .yml | .json | .tsp'],
    [
      { input: 'openapi.yaml', schema: 'yup' },
      'schema: Expected "zod" | "valibot" | "arktype" | "effect"',
    ],
    [
      { input: 'openapi.yaml', output: 'src/routes.ts' },
      'output: must be a directory, not a .ts file',
    ],
    [
      { input: 'openapi.yaml', components: { schemas: { output: 'a.ts', split: true } } },
      'components.schemas.output: must be a directory, not a .ts file',
    ],
    [
      { input: 'openapi.yaml', components: { output: 'a.ts', schemas: { output: 'b.ts' } } },
      'components: components.output (one file for every component) excludes per-kind outputs (schemas, responses, ...)',
    ],
    [
      { input: 'openapi.yaml', type: { output: 'src/routes/index.ts' } },
      'type.output and output both write to src/routes/index.ts. Give each its own output path.',
    ],
  ])('rejects %j', (config, message) => {
    expect(Effect.runSync(Effect.flip(parseConfig(config)))).toMatchObject({
      _tag: 'ConfigError',
      message: `Invalid config: ${message}`,
    })
  })
})

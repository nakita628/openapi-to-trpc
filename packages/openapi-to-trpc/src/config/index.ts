import { posix, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { Effect, FileSystem, Schema, SchemaIssue, SchemaTransformation } from 'effect'
import type { FormatConfig } from 'oxfmt'

/**
 * A path constrained to a set of extensions.
 *
 * `Schema.TemplateLiteral` carries the literal type but its rejection reads "Expected a string
 * matching template literal parts"; `Schema.declare` over the same guard keeps the type on both
 * sides — so `defineConfig` still rejects a wrong extension while you type — and lets the
 * message say which extensions are meant.
 */
const DocumentPathSchema = Schema.declare<
  `${string}.yaml` | `${string}.yml` | `${string}.json` | `${string}.tsp`
>(
  Schema.is(
    Schema.TemplateLiteral([Schema.String, Schema.Literals(['.yaml', '.yml', '.json', '.tsp'])]),
  ),
  { message: 'must be .yaml | .yml | .json | .tsp' },
)

const TypeScriptPathSchema = Schema.declare<`${string}.ts`>(
  Schema.is(Schema.TemplateLiteral([Schema.String, '.ts'])),
  { message: 'must be a .ts file' },
)

const DirectorySchema = Schema.String.check(
  Schema.isPattern(/^(?!.*\.ts$).+/u, { message: 'must be a directory, not a .ts file' }),
)

const FileOutputSchema = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transform({
      decode: (v: string) => (v.endsWith('.ts') ? v : `${v}/index.ts`),
      encode: (v: string) => v,
    }),
  ),
).annotate({
  title: 'Output file',
  description:
    'Single file that receives every entry. A directory is normalized to `<dir>/index.ts`.',
  examples: ['./src/components.ts', './src/components'],
})

const ExportTypesSchema = Schema.Boolean.pipe(
  Schema.withDecodingDefault(Effect.succeed(false)),
).annotate({
  description:
    'Also export the type inferred from each entry (parameters, headers; schemas always do).',
})

/**
 * One component kind's output target. `split: true` writes one file per entry into a
 * directory, anything else a single file.
 *
 * `Schema.Union` resolves members in order and each member pins `split` to a literal, so a
 * member is only reachable through its own discriminant — the failure reported is the one
 * inside the matching branch, not a union-wide "no member matched".
 */
const ComponentOutputSchema = Schema.Union([
  Schema.Struct({
    split: Schema.Literal(true).annotate({
      description: 'Write one file per entry into `output`, plus an index.ts barrel.',
    }),
    output: DirectorySchema.annotate({
      title: 'Output directory',
      examples: ['./src/components/schemas'],
    }),
    exportTypes: ExportTypesSchema,
  }),
  Schema.Struct({
    split: Schema.Literal(false)
      .pipe(Schema.withDecodingDefault(Effect.succeed(false)))
      .annotate({ description: 'Write every entry into a single file (default).' }),
    output: FileOutputSchema,
    exportTypes: ExportTypesSchema,
  }),
]).annotate({
  title: 'Component output target',
  description: 'Where one component kind is written. `split` picks directory or single-file mode.',
  examples: [
    { split: false, output: './src/components/responses.ts', exportTypes: false },
    { split: true, output: './src/components/schemas', exportTypes: false },
  ],
})

/** Component sections that each take their own output target. */
const COMPONENT_KINDS = [
  'schemas',
  'parameters',
  'headers',
  'responses',
  'requestBodies',
  'examples',
  'securitySchemes',
  'links',
  'callbacks',
  'pathItems',
] as const

const ConfigSchema = Schema.Struct({
  input: DocumentPathSchema.annotate({
    title: 'Input document',
    description: 'OpenAPI or TypeSpec document the routers are generated from.',
    examples: ['openapi.yaml', './spec/openapi.json', './spec/main.tsp'],
  }),
  schema: Schema.Literals(['zod', 'valibot', 'arktype', 'effect'])
    .pipe(Schema.withDecodingDefault(Effect.succeed('zod')))
    .annotate({
      title: 'Validator library',
      description: 'Library the component schemas and procedure inputs/outputs are written in.',
    }),
  output: DirectorySchema.pipe(Schema.withDecodingDefault(Effect.succeed('src/routes'))).annotate({
    title: 'Router directory',
    description: 'One router file per resource, plus the `appRouter` in index.ts.',
    examples: ['src/routes', './server/routers'],
  }),
  readonly: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))).annotate({
    description: '`as const` on the data components (responses, examples, links, ...).',
  }),
  format: Schema.optionalKey(
    Schema.declare<FormatConfig>((u): u is FormatConfig => typeof u === 'object' && u !== null, {
      title: 'Formatter options',
      description:
        'oxfmt `FormatConfig` applied to every generated file. Defaults to printWidth 100, single quotes, no semicolons.',
      examples: [{ printWidth: 80, semi: true }],
    }),
  ),
  components: Schema.optionalKey(
    Schema.Struct({
      output: Schema.optionalKey(
        FileOutputSchema.annotate({
          title: 'Single-file components output',
          description:
            'Every component kind in one file. Mutually exclusive with the per-kind fields below.',
        }),
      ),
      schemas: Schema.optionalKey(ComponentOutputSchema),
      parameters: Schema.optionalKey(ComponentOutputSchema),
      headers: Schema.optionalKey(ComponentOutputSchema),
      responses: Schema.optionalKey(ComponentOutputSchema),
      requestBodies: Schema.optionalKey(ComponentOutputSchema),
      examples: Schema.optionalKey(ComponentOutputSchema),
      securitySchemes: Schema.optionalKey(ComponentOutputSchema),
      links: Schema.optionalKey(ComponentOutputSchema),
      callbacks: Schema.optionalKey(ComponentOutputSchema),
      pathItems: Schema.optionalKey(ComponentOutputSchema),
    })
      .check(
        Schema.makeFilter(
          (v) => v.output === undefined || !COMPONENT_KINDS.some((k) => v[k] !== undefined),
          {
            message:
              'components.output (one file for every component) excludes per-kind outputs (schemas, responses, ...)',
          },
        ),
      )
      .annotate({
        title: 'Components output',
        description:
          'Either `output` for one file, or per-kind fields that each get their own target. Schemas default to components/index.ts next to the router directory; the other kinds are only written when configured.',
      }),
  ),
  type: Schema.optionalKey(
    Schema.Struct({
      output: TypeScriptPathSchema.annotate({
        title: 'Types output file',
        examples: ['./src/types.ts'],
      }),
    }).annotate({
      title: 'Router type helpers',
      description: '`RouterInputs` / `RouterOutputs` inferred from the `appRouter`.',
    }),
  ),
})
  .check(
    // Two outputs aimed at one path is silent data loss, not a merge: every file is written
    // concurrently, so whichever finishes last survives. Compared after decoding, where a
    // directory `output` has already become `<dir>/index.ts` and `./a.ts` and `a.ts` are the
    // same path. The router directory claims its index.ts, where the `appRouter` goes.
    Schema.makeFilter(
      (v) => {
        const declared: readonly (readonly [string, string | undefined])[] = [
          ['output', posix.join(v.output, 'index.ts')],
          ['components.output', v.components?.output],
          ...COMPONENT_KINDS.map(
            (kind) => [`components.${kind}.output`, v.components?.[kind]?.output] as const,
          ),
          ['type.output', v.type?.output],
        ]
        const seen = new Map<string, string>()
        for (const [field, output] of declared) {
          if (output === undefined) continue
          const key = posix.normalize(output).replace(/\/+$/u, '')
          const first = seen.get(key)
          if (first !== undefined) {
            return `${field} and ${first} both write to ${output}. Give each its own output path.`
          }
          seen.set(key, field)
        }
        return true
      },
      { message: 'every output needs its own path' },
    ),
  )
  .annotate({
    title: 'openapi-to-trpc config',
    description:
      'Everything `openapi-to-trpc` generates from one OpenAPI or TypeSpec document. Only `input` is required.',
  })

/** A validated config: every default filled in and every output path normalized. */
export type Config = typeof ConfigSchema.Type

/**
 * The config file is missing, is not a module with a default export, or does not validate.
 *
 * `notFound` separates "there is no config here" from "the config here is wrong": only the
 * first is the caller who ran `openapi-to-trpc` with nothing and needs to be told what the
 * command accepts. Everything else already names the field that is wrong.
 */
// oxlint-disable-next-line unicorn/throw-new-error -- `Schema.TaggedError()` is the class factory, not a throw
export class ConfigError extends Schema.TaggedError<ConfigError>()('ConfigError', {
  message: Schema.String,
  notFound: Schema.optionalKey(Schema.Boolean),
}) {}

// Built once and reused at the edge, rather than rebuilt per call.
const decodeConfig = Schema.decodeUnknownEffect(ConfigSchema)
const formatIssue = SchemaIssue.makeFormatterStandardSchemaV1()

/**
 * Validates an already-loaded config object. The first issue is reported as
 * `<a.b.c>: <message>`: a config file is written by hand, so naming the field that is wrong
 * matters more than listing every consequence of it.
 */
export function parseConfig(config: unknown) {
  return decodeConfig(config).pipe(
    Effect.mapError((error) => {
      const issue = formatIssue(error.issue).issues[0]
      const path = (issue?.path ?? [])
        .map((segment) => String(typeof segment === 'object' ? segment.key : segment))
        .join('.')
      const prefix = path === '' ? '' : `${path}: `
      return new ConfigError({ message: `Invalid config: ${prefix}${issue?.message ?? ''}` })
    }),
  )
}

/** Loads and validates a config file (default `./openapi-to-trpc.config.ts`) from the cwd. */
export function readConfig(configPath = 'openapi-to-trpc.config.ts') {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const abs = resolve(process.cwd(), configPath)
    // Checked before importing so a missing file reads as "no config here" rather than as
    // whatever the module loader throws.
    const found = yield* fs
      .exists(abs)
      .pipe(Effect.catchTag('PlatformError', () => Effect.succeed(false)))
    if (!found) {
      return yield* new ConfigError({ message: `Config not found: ${abs}`, notFound: true })
    }
    const mod: unknown = yield* Effect.tryPromise({
      try: () => import(pathToFileURL(abs).href),
      catch: (error) =>
        new ConfigError({ message: error instanceof Error ? error.message : String(error) }),
    })
    // `'default' in mod` is what narrows `mod` for TypeScript; `export default undefined`
    // leaves the key present, which is why both halves are here.
    if (
      typeof mod !== 'object' ||
      mod === null ||
      !('default' in mod) ||
      mod.default === undefined
    ) {
      return yield* new ConfigError({ message: `Config must export a default object: ${abs}` })
    }
    return yield* parseConfig(mod.default)
  })
}

/**
 * Type-checks a config file's default export. The CLI validates the object when it loads the
 * file; this helper is identity at runtime so editors see `ConfigSchema.Encoded` while you type.
 */
export function defineConfig(config: typeof ConfigSchema.Encoded) {
  return config
}

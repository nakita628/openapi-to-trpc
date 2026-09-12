import path from 'node:path'

import { Data, Effect, FileSystem } from 'effect'
import { makeAdapter, parseOpenAPI, toIdentifierPascalCase } from 'oas-truth'
import type { Components, OpenAPI } from 'oas-truth'
import { format } from 'oxfmt'
import type { FormatConfig } from 'oxfmt'

import type { Config } from '../config/index.js'
import { KINDS, makeDeclarations, makeModule } from '../generator/components.js'
import type { Context, Kind } from '../generator/components.js'
import { makeAppRouter, makeProcedures, makeRouter, makeRouterTypes } from '../generator/router.js'
import { schemaId } from '../generator/schemas.js'
import { mergeRouter } from '../merge/index.js'

export type GeneratedFile = {
  readonly path: string
  readonly code: string
  /** Router files keep the hand-written parts of an existing file (see `mergeRouter`). */
  readonly merge?: boolean
}

type Target = {
  readonly kinds: readonly Kind[]
  readonly output: string
  readonly split: boolean
  readonly exportTypes: boolean
}

/** Parsing the document, generating from it or formatting the result failed. */
export class GenerateError extends Data.TaggedError('GenerateError')<{
  readonly message: string
}> {}

function toGenerateError(error: unknown) {
  return new GenerateError({ message: error instanceof Error ? error.message : String(error) })
}

/**
 * Parses `config.input`, generates every file and writes them concurrently through the
 * `FileSystem` the caller provides. Router files are merged into what is already there.
 */
export function openapiToTrpc(config: Config) {
  return Effect.gen(function* () {
    const parsed = yield* Effect.tryPromise({
      try: () => parseOpenAPI(config.input),
      catch: toGenerateError,
    })
    if (!parsed.ok) return yield* new GenerateError({ message: parsed.error })
    const files = yield* Effect.try({
      try: () => makeFiles(parsed.value, config),
      catch: toGenerateError,
    })
    yield* Effect.all(
      files.map((file) => emit(file, config.format)),
      { concurrency: 'unbounded' },
    )
    return `openapi-to-trpc: ${config.input} (${config.schema})`
  })
}

/** Merge (router files), format and write one file. */
function emit(file: GeneratedFile, options: FormatConfig | undefined) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const existing = file.merge
      ? yield* fs
          .readFileString(file.path)
          .pipe(Effect.catchTag('PlatformError', () => Effect.succeed(undefined)))
      : undefined
    const code = existing === undefined ? file.code : mergeRouter(existing, file.code)
    const formatted = yield* Effect.tryPromise({
      try: () =>
        format(file.path, code, { printWidth: 100, singleQuote: true, semi: false, ...options }),
      catch: toGenerateError,
    })
    if (formatted.errors.length > 0) {
      return yield* new GenerateError({
        message: formatted.errors.map((error) => `${file.path}: ${error.message}`).join('\n'),
      })
    }
    yield* fs.makeDirectory(path.dirname(file.path), { recursive: true })
    return yield* fs.writeFileString(file.path, formatted.code)
  })
}

/** Every file to write, as unformatted code keyed by absolute path. */
export function makeFiles(openapi: OpenAPI, config: Config): readonly GeneratedFile[] {
  const components = openapi.components ?? {}
  const context: Context = {
    adapter: makeAdapter(config.schema),
    library: config.schema,
    readonly: config.readonly,
    schemaIds: new Set(Object.keys(components.schemas ?? {}).map(schemaId)),
  }
  const targets = makeTargets(config)
  const schemas = targets.find((target) => target.kinds.includes('schemas'))
  const schemasModule = schemas?.split ? path.join(schemas.output, 'index.ts') : schemas?.output
  const toSchemas = (file: string) => () => specifier(file, schemasModule ?? file)

  const componentFiles = targets.flatMap((target) =>
    makeComponentFiles(target, components, context, toSchemas),
  )

  const routesDir = path.resolve(config.output)
  const appRouter = path.join(routesDir, 'index.ts')
  const procedures = makeProcedures(openapi, context)
  const routerFiles = Array.from(procedures, ([router, list]) => {
    const file = path.join(routesDir, `${router}.ts`)
    const code = makeModule(makeRouter(router, list), context, toSchemas(file), [
      "import {initTRPC,TRPCError} from '@trpc/server'",
    ])
    return { path: file, code, merge: true }
  })
  const typeFile = config.type && path.resolve(config.type.output)

  return [
    ...componentFiles,
    ...routerFiles,
    { path: appRouter, code: makeAppRouter([...procedures.keys()]) },
    ...(typeFile
      ? [{ path: typeFile, code: makeRouterTypes(specifier(typeFile, appRouter)) }]
      : []),
  ]
}

/** One file per target, or for a split target one file per entry plus an index.ts barrel. */
function makeComponentFiles(
  { kinds, output, split, exportTypes }: Target,
  components: Components,
  context: Context,
  toSchemas: (file: string) => () => string,
): readonly GeneratedFile[] {
  const declarations = kinds.flatMap((kind) =>
    makeDeclarations(kind, components, context, exportTypes),
  )
  if (declarations.length === 0) return []
  if (!split) {
    const code = declarations.map((d) => d.code).join('\n\n')
    return [{ path: output, code: makeModule(code, context, toSchemas(output)) }]
  }
  const fileName = (name: string) => uncapitalize(toIdentifierPascalCase(name))
  return [
    ...declarations.map(({ name, code }) => {
      const file = path.join(output, `${fileName(name)}.ts`)
      // A split target holds one kind. Split schemas import each other file by file; the
      // other kinds import the schemas module.
      const from = kinds.includes('schemas')
        ? (id: string) => `./${uncapitalize(id.replace(/Schema$/u, ''))}`
        : toSchemas(file)
      return { path: file, code: makeModule(code, context, from) }
    }),
    {
      path: path.join(output, 'index.ts'),
      code: declarations
        .map(({ name }) => `export * from './${fileName(name)}'`)
        .toSorted()
        .join('\n'),
    },
  ]
}

/**
 * Where each component kind goes: every kind into `components.output`, or each configured kind
 * into its own output — schemas always, by default into `components/index.ts` next to the router
 * directory (`src/components/index.ts` for the default `src/routes`).
 */
function makeTargets(config: Config): readonly Target[] {
  const { output, ...kinds } = config.components ?? {}
  if (output !== undefined) {
    return [{ kinds: KINDS, output: path.resolve(output), split: false, exportTypes: false }]
  }
  return KINDS.flatMap((kind) => {
    const target =
      kinds[kind] ??
      (kind === 'schemas'
        ? {
            output: path.join(path.dirname(config.output), 'components', 'index.ts'),
            split: false,
            exportTypes: false,
          }
        : undefined)
    return target ? [{ ...target, kinds: [kind], output: path.resolve(target.output) }] : []
  })
}

/** Extensionless relative import from `from` to `to`, `index` resolved to its directory. */
function specifier(from: string, to: string) {
  const relative =
    path
      .relative(path.dirname(from), to)
      .replaceAll('\\', '/')
      .replace(/\.ts$/u, '')
      .replace(/\/?\bindex$/u, '') || '.'
  return relative.startsWith('.') ? relative : `./${relative}`
}

function uncapitalize(text: string) {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`
}

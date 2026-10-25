import path from 'node:path'

import { Data, Effect, FileSystem } from 'effect'
import { parseOpenAPI } from 'oas-truth'
import type { Components, OpenAPI } from 'oas-truth'
import { format } from 'oxfmt'
import type { FormatConfig } from 'oxfmt'

import type { Config } from '../config/index.js'
import { makeClient } from '../generator/client.js'
import {
  KINDS,
  makeContext,
  makeDeclarations,
  makeModule,
  schemaImportPath,
} from '../generator/components.js'
import type { Context, Kind } from '../generator/components.js'
import { makeAppRouter, makeProcedures, makeRouter, makeRouterTypes } from '../generator/router.js'
import { mergeRouter } from '../merge/index.js'

export type GeneratedFile = {
  readonly path: string
  readonly code: string
  /** Router files keep the hand-written parts of an existing file (see `mergeRouter`). */
  readonly merge?: boolean
}

type Target = {
  /** The field of the config the target is, `components.schemas` or `components.output`. */
  readonly name: string
  readonly kinds: readonly Kind[]
  readonly output: string
  readonly split: boolean
  readonly exportTypes: boolean
  readonly package: string | undefined
}

/** The package root of a generated file, when it is known. */
export type PackageRoot = (file: string) => string | undefined

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
    const packageRoot = yield* packageRoots(config)
    const files = yield* Effect.try({
      try: () => makeFiles(parsed.value, config, packageRoot),
      catch: toGenerateError,
    })
    yield* Effect.all(
      files.map((file) => emit(file, config.format)),
      { concurrency: 'unbounded' },
    )
    return `openapi-to-trpc: ${config.input} (${config.schema})`
  })
}

/**
 * The package each generated file is written into, as `makeFiles` wants it: a file imports
 * another one of its package relatively, and one of another package by that one's `package`.
 * A package is what the nearest `package.json` above an output delimits.
 */
function packageRoots(config: Config) {
  return Effect.gen(function* () {
    const directories = outputDirectories(config)
    const roots = yield* Effect.forEach(directories, packageRootOf)
    const known = new Map(directories.map((dir, index) => [dir, roots[index]]))
    const packageRoot: PackageRoot = (file) => known.get(path.dirname(path.resolve(file)))
    return packageRoot
  })
}

/** The directory of the nearest `package.json` at or above `directory`. */
function packageRootOf(directory: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const directories: string[] = []
    for (let dir = directory; ; dir = path.dirname(dir)) {
      directories.push(dir)
      if (path.dirname(dir) === dir) break
    }
    // A directory that is not there yet holds no package.json.
    const found = yield* Effect.forEach(directories, (dir) =>
      fs
        .exists(path.join(dir, 'package.json'))
        .pipe(Effect.catchTag('PlatformError', () => Effect.succeed(false))),
    )
    return directories.find((_, index) => found[index])
  })
}

/** Every directory a generated file is written into: a split target is a directory of its own. */
function outputDirectories(config: Config) {
  return [
    ...new Set([
      path.resolve(config.output),
      ...makeTargets(config).map((target) =>
        target.split ? target.output : path.dirname(target.output),
      ),
      ...[config.type?.output, config.client?.output].flatMap((output) =>
        output === undefined ? [] : [path.dirname(path.resolve(output))],
      ),
    ]),
  ]
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

/**
 * Every file to write, as unformatted code keyed by absolute path. `packageRoot` tells which
 * package a file is written into; left out, every file is taken to be in one package.
 */
export function makeFiles(
  openapi: OpenAPI,
  config: Config,
  packageRoot: PackageRoot = () => undefined,
): readonly GeneratedFile[] {
  const components = openapi.components ?? {}
  const targets = makeTargets(config)
  const schemas = targets.find((target) => target.kinds.includes('schemas'))
  // Schemas export their inferred types unless their own target turns it off; a single
  // components file always carries them.
  const context = makeContext(
    config.schema,
    config.readonly,
    components.schemas,
    config.components?.schemas?.exportTypes ?? true,
  )
  const importOf = makeImport(config, packageRoot)
  const schemasModule = schemas && {
    ...schemas,
    output: schemas.split ? path.join(schemas.output, 'index.ts') : schemas.output,
  }
  const toSchemas = (from: string, file: string) => () =>
    schemasModule === undefined ? '.' : importOf(from, file, schemasModule)

  const componentFiles = targets.flatMap((target) =>
    makeComponentFiles(target, components, context, toSchemas),
  )

  const routesDir = path.resolve(config.output)
  const appRouter = { name: 'output', output: path.join(routesDir, 'index.ts'), package: undefined }
  const procedures = makeProcedures(openapi, context)
  const routerFiles = Array.from(procedures, ([router, list]) => {
    const file = path.join(routesDir, `${router}.ts`)
    const code = makeModule(makeRouter(router, list), context, toSchemas('output', file), [
      "import {initTRPC,TRPCError} from '@trpc/server'",
    ])
    return { path: file, code, merge: true }
  })
  const typeFile = config.type && path.resolve(config.type.output)
  const clientFile = config.client && path.resolve(config.client.output)

  return [
    ...componentFiles,
    ...routerFiles,
    { path: appRouter.output, code: makeAppRouter([...procedures.keys()]) },
    ...(typeFile
      ? [{ path: typeFile, code: makeRouterTypes(importOf('type', typeFile, appRouter, true)) }]
      : []),
    ...(config.client && clientFile
      ? [
          {
            path: clientFile,
            code: makeClient(
              config.client.import ?? importOf('client', clientFile, appRouter, true),
              config.client.baseUrl,
              config.client.credentials,
            ),
          },
        ]
      : []),
  ]
}

/** One file per target, or for a split target one file per entry plus an index.ts barrel. */
function makeComponentFiles(
  { name, kinds, output, split, exportTypes }: Target,
  components: Components,
  context: Context,
  toSchemas: (from: string, file: string) => () => string,
): readonly GeneratedFile[] {
  const declarations = kinds.flatMap((kind) =>
    makeDeclarations(kind, components, context, exportTypes),
  )
  if (declarations.length === 0) return []
  if (!split) {
    const code = declarations.map((d) => d.code).join('\n\n')
    return [{ path: output, code: makeModule(code, context, toSchemas(name, output)) }]
  }
  return [
    ...declarations.map(({ code, fileName }) => {
      const file = path.join(output, `${fileName}.ts`)
      // A split target holds one kind. Split schemas import each other file by file; the
      // other kinds import the schemas module.
      const from = kinds.includes('schemas')
        ? (id: string) => schemaImportPath(context, id)
        : toSchemas(name, file)
      return { path: file, code: makeModule(code, context, from) }
    }),
    {
      path: path.join(output, 'index.ts'),
      code: declarations
        .map(({ fileName }) => `export * from './${fileName}'`)
        .toSorted()
        .join('\n'),
    },
  ]
}

/**
 * Where each component kind goes: every kind into `components.output`, or each configured kind
 * into its own output — schemas always, by default into `components/index.ts` next to the router
 * directory (`src/components/index.ts` for the default `src/routes`). A directory that is not
 * split is its `index.ts`; `exportTypes` is only taken by the kinds whose entries are
 * validators.
 */
function makeTargets(config: Config): readonly Target[] {
  const { output, ...kinds } = config.components ?? {}
  if (output !== undefined) {
    return [
      {
        name: 'components.output',
        kinds: KINDS,
        output: path.resolve(output),
        split: false,
        exportTypes: false,
        package: kinds.package,
      },
    ]
  }
  return KINDS.flatMap((kind) => {
    const target =
      kinds[kind] ??
      (kind === 'schemas'
        ? { output: path.join(path.dirname(config.output), 'components', 'index.ts'), split: false }
        : undefined)
    if (target === undefined) return []
    const file =
      target.split || target.output.endsWith('.ts')
        ? target.output
        : path.join(target.output, 'index.ts')
    return [
      {
        name: `components.${kind}`,
        kinds: [kind],
        output: path.resolve(file),
        split: target.split,
        exportTypes: 'exportTypes' in target && target.exportTypes === true,
        package: 'package' in target ? target.package : undefined,
      },
    ]
  })
}

/**
 * How a generated file imports a target, the way hono-takibi does: by the target's `package`
 * from another package, under `pathAlias` when the target is in the directory that holds the
 * router directory, and relatively otherwise. A target of another package that names no
 * `package` could not be imported, unless `relative` lets the import cross into it as a path.
 */
function makeImport(config: Config, packageRoot: PackageRoot) {
  const aliasRoot = path.dirname(path.resolve(config.output))
  const alias = config.pathAlias?.replace(/\/$/u, '')
  return (
    from: string,
    file: string,
    target: {
      readonly name: string
      readonly output: string
      readonly package: string | undefined
    },
    relative = false,
  ) => {
    // A barrel is imported by its directory.
    const module = target.output.replace(/(?:\/index)?\.ts$/u, '')
    if (packageRoot(file) !== packageRoot(target.output)) {
      if (target.package !== undefined) return target.package
      if (!relative) {
        const field =
          target.name === 'components.output' ? 'components.package' : `${target.name}.package`
        throw new Error(
          `${from} imports ${target.name} from another package: set ${field} to the name of the package ${path.relative(process.cwd(), target.output)} is written into.`,
        )
      }
    } else if (alias !== undefined) {
      const inside = path.relative(aliasRoot, module).replaceAll('\\', '/')
      if (inside !== '' && !inside.startsWith('..')) return `${alias}/${inside}`
    }
    const specifier = path.relative(path.dirname(file), module).replaceAll('\\', '/') || '.'
    return specifier.startsWith('.') ? specifier : `./${specifier}`
  }
}

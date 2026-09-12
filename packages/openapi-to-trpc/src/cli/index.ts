import { fileURLToPath } from 'node:url'

import { Console, Effect, FileSystem, Option, Runtime, Schema } from 'effect'
import { Argument, CliError, CliOutput, Command, Flag } from 'effect/unstable/cli'

const COMMAND_NAME = 'openapi-to-trpc'

/** Config file picked up from the working directory when neither `<input>` nor `--config` is given. */
const DEFAULT_CONFIG_FILE = 'openapi-to-trpc.config.ts'

// `Schema.refine` both rejects the value at runtime and narrows the parsed type. The template
// literal alone would do the same check but reports "Expected a string matching template literal
// parts"; wrapping it in `Schema.is` and refining with it is what buys the sentence below.
const DocumentPathSchema = Schema.String.pipe(
  Schema.refine(
    Schema.is(
      Schema.TemplateLiteral([Schema.String, Schema.Literals(['.yaml', '.yml', '.json', '.tsp'])]),
    ),
    { message: 'an OpenAPI (.yaml, .json) or TypeSpec (.tsp) document' },
  ),
)

/**
 * The command line itself: what `openapi-to-trpc` accepts, what each piece means, and the schema
 * every value is decoded through before {@link generate} ever sees it.
 */
const commandLine = {
  input: Argument.File('input', { mustExist: true }).pipe(
    Argument.withSchema(DocumentPathSchema),
    Argument.withDescription('OpenAPI (.yaml, .json) or TypeSpec (.tsp) document to generate from'),
    Argument.withMetavar('input.{yaml,json,tsp}'),
    Argument.optional,
  ),
  output: Flag.String('output').pipe(
    Flag.withAlias('o'),
    Flag.withDescription('Router directory for <input> (default: src/routes)'),
    Flag.withMetavar('dir'),
    Flag.optional,
  ),
  schema: Flag.Literals('schema', ['zod', 'valibot', 'arktype', 'effect']).pipe(
    Flag.withAlias('s'),
    Flag.withDescription('Validator library for <input> (default: zod)'),
    Flag.withMetavar('library'),
    Flag.optional,
  ),
  config: Flag.File('config', { mustExist: true }).pipe(
    Flag.withAlias('c'),
    Flag.withDescription(`Config file to run (default: ./${DEFAULT_CONFIG_FILE})`),
    Flag.withMetavar('file'),
    Flag.optional,
  ),
} as const

/** A failure that leaves the caller without a command to run: answered with the help. */
function showHelp(message: string) {
  return new CliError.ShowHelp({
    commandPath: [COMMAND_NAME],
    errors: [new CliError.UserError({ cause: new Error(message), userMessage: message })],
  })
}

/**
 * Everything the command does once the command line has parsed. It resolves to one of two
 * modes: an `<input>` document (with `--output` / `--schema`), or a config file — `--config`
 * or `./openapi-to-trpc.config.ts`. The two are mutually exclusive.
 *
 * The generator pipeline pulls in the OpenAPI parser, the TypeSpec compiler and ts-morph.
 * `--help`, `--version`, `--completions` and every rejected command line must not pay for
 * that, so it is loaded past the guard clauses rather than at module scope.
 */
function generate(args: Command.Command.Config.Infer<typeof commandLine>) {
  return Effect.gen(function* () {
    const input = Option.getOrUndefined(args.input)
    const output = Option.getOrUndefined(args.output)
    const schema = Option.getOrUndefined(args.schema)
    const configPath = Option.getOrUndefined(args.config)

    if (configPath !== undefined && (input ?? output ?? schema) !== undefined) {
      return yield* showHelp(
        '--config cannot be combined with <input>, --output or --schema. A config file already names its own input and outputs.',
      )
    }
    if (input === undefined && (output ?? schema) !== undefined) {
      return yield* showHelp('--output and --schema describe an <input> document.')
    }
    // Past the guards, so `--help`, `--version` and a rejected command line never load the
    // OpenAPI parser, the TypeSpec compiler and ts-morph.
    const [{ parseConfig, readConfig }, { openapiToTrpc }] = yield* Effect.promise(() =>
      Promise.all([import('../config/index.js'), import('../core/index.js')]),
    )
    const config =
      input === undefined
        ? yield* readConfig(configPath).pipe(
            // A config that is absent and was never asked for is the "ran `openapi-to-trpc`
            // with nothing" case, the one place where the usage block is the answer. A config
            // that is present and wrong already names the field, and the usage only buries it.
            Effect.mapError((error) =>
              configPath === undefined && error.notFound === true ? showHelp(error.message) : error,
            ),
          )
        : yield* parseConfig({ input, output, schema })
    return yield* Console.log(yield* openapiToTrpc(config))
  }).pipe(
    // A `CliError` is already something the runner renders — `ShowHelp` with the generated
    // help. Everything else is a config, generator or filesystem failure carrying a sentence.
    Effect.mapError((error) =>
      CliError.isCliError(error)
        ? error
        : new CliError.UserError({ cause: error, userMessage: error.message }),
    ),
  )
}

/**
 * The `openapi-to-trpc` command: parsing, validation, `--help`, `--version` and shell
 * completions are owned by `effect/unstable/cli`, {@link generate} is the rest.
 */
const command = Command.make(COMMAND_NAME, commandLine, generate).pipe(
  Command.withDescription('Generate tRPC routers from OpenAPI or TypeSpec'),
  Command.withExamples([
    {
      command: 'openapi-to-trpc openapi.yaml',
      description: 'Generate routers into src/routes and schemas into src/components',
    },
    {
      command: 'openapi-to-trpc openapi.yaml -s valibot -o server/routers',
      description: 'Pick the validator library and the router directory',
    },
    {
      command: 'openapi-to-trpc',
      description: `Run ./${DEFAULT_CONFIG_FILE}`,
    },
    {
      command: 'openapi-to-trpc --config config/trpc.config.ts',
      description: 'Run a config file from another location',
    },
  ]),
)

/**
 * Runs `openapi-to-trpc` against an argument list.
 *
 * `entryUrl` is the `import.meta.url` of the executable, and `--version` is read from the
 * `package.json` beside it: `src/index.ts` and the `dist/cli.js` it is packed into both sit
 * one directory below the manifest. A manifest that is missing or malformed is a broken
 * install, so it fails — through the error channel, as a sentence.
 */
export function cli(argv: readonly string[], entryUrl: string) {
  return Effect.gen(function* () {
    const manifestPath = fileURLToPath(new URL('../package.json', entryUrl))
    const fs = yield* FileSystem.FileSystem
    const source = yield* fs.readFileString(manifestPath)
    const manifest = yield* Effect.try({
      try: (): unknown => JSON.parse(source),
      catch: (cause) => new Error(`${manifestPath} is not valid JSON`, { cause }),
    })
    const { version } = yield* Schema.decodeUnknownEffect(
      Schema.Struct({ version: Schema.String }),
    )(manifest)
    return yield* Command.runWith(command, { version })(argv)
  }).pipe(Effect.catchIf((error) => !CliError.isCliError(error), reportBrokenInstall))
}

/**
 * The version could not be read. `Command.runWith` renders the errors raised inside the
 * command, but this one is raised before it runs, so it is rendered here through the same
 * formatter and marked as already reported, so `runMain` does not print it a second time.
 */
function reportBrokenInstall(cause: { readonly message: string }) {
  return Effect.gen(function* () {
    const error = new CliError.UserError({
      cause,
      userMessage: `Cannot read the version from package.json: ${cause.message}`,
    })
    error[Runtime.errorReported] = false
    const formatter = yield* CliOutput.Formatter
    yield* Console.error(formatter.formatError(error))
    return yield* error
  })
}

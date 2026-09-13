import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as NodeServices from '@effect/platform-node/NodeServices'
import { Console, Effect, Exit } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { cli } from './index.js'

const ENTRY_URL = new URL('../index.ts', import.meta.url).href
const SPECS = path.resolve(import.meta.dirname, '../../../../test/specs')
// SGR escapes the CLI formatter emits when stdout is a TTY, stripped so the assertions compare
// plain text either way.
const ANSI = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, 'gu')

/**
 * Runs the CLI the way the entry does, recording what it prints: the command's own output, the
 * rendered help and every error message all go through `Console`.
 */
async function runCli(argv: readonly string[]) {
  const stdout: string[] = []
  const stderr: string[] = []
  const recorder: Console.Console = Object.assign(Object.create(console), {
    log: (...args: readonly unknown[]) => stdout.push(args.map(String).join(' ')),
    error: (...args: readonly unknown[]) => stderr.push(args.map(String).join(' ')),
  })
  const exit = await Effect.runPromiseExit(
    cli(argv, ENTRY_URL).pipe(
      Effect.provideService(Console.Console, recorder),
      Effect.provide(NodeServices.layer),
    ),
  )
  return {
    ok: Exit.isSuccess(exit),
    stdout: stdout.join('\n').replaceAll(ANSI, ''),
    stderr: stderr.join('\n').replaceAll(ANSI, ''),
  }
}

let tmpDir = ''

function useTmpDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-to-trpc-cli-'))
  return tmpDir
}

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  tmpDir = ''
})

describe('openapi-to-trpc <input>', () => {
  it('generates routers into --output and schemas next to them, with --schema', async () => {
    const dir = useTmpDir()
    const input = path.join(SPECS, 'openapi.yaml')

    const result = await runCli([input, '-s', 'valibot', '-o', path.join(dir, 'server/routers')])

    expect(result).toStrictEqual({
      ok: true,
      stdout: `openapi-to-trpc: ${input} (valibot)`,
      stderr: '',
    })
    const written = fs.readdirSync(path.join(dir, 'server'), { encoding: 'utf-8', recursive: true })
    expect(written.sort((a, b) => a.localeCompare(b))).toStrictEqual([
      'components',
      'components/index.ts',
      'routers',
      'routers/index.ts',
      'routers/posts.ts',
      'routers/userProfiles.ts',
    ])
    expect(fs.readFileSync(path.join(dir, 'server/routers/posts.ts'), 'utf-8')).toContain(
      "import * as v from 'valibot'",
    )
  })

  it('surfaces a generator failure', async () => {
    const dir = useTmpDir()
    const input = path.join(dir, 'broken.yaml')
    fs.writeFileSync(
      input,
      [
        'openapi: 3.1.0',
        'info: { title: Broken, version: 1.0.0 }',
        'paths:',
        '  /x:',
        '    get:',
        '      responses:',
        "        '200':",
        "          $ref: '#/components/responses/Missing'",
        '',
      ].join('\n'),
    )

    const result = await runCli([input, '-o', path.join(dir, 'routes')])

    expect(result.ok).toBe(false)
    expect(result.stderr).toContain('Missing $ref pointer "#/components/responses/Missing"')
  })

  it('rejects an input whose extension is not .yaml/.json/.tsp', async () => {
    const file = path.join(useTmpDir(), 'openapi.txt')
    fs.writeFileSync(file, '')

    const result = await runCli([file])

    expect(result.ok).toBe(false)
    expect(result.stderr).toContain('an OpenAPI (.yaml, .json) or TypeSpec (.tsp) document')
  })
})

describe('openapi-to-trpc --config', () => {
  it('runs the config file it names', async () => {
    const dir = useTmpDir()
    const config = path.join(dir, 'trpc.config.ts')
    const input = path.join(SPECS, 'openapi.yaml')
    fs.writeFileSync(
      config,
      `export default ${JSON.stringify({
        input,
        schema: 'effect',
        output: path.join(dir, 'routes'),
        type: { output: path.join(dir, 'types.ts') },
      })}\n`,
    )

    const result = await runCli(['--config', config])

    expect(result).toStrictEqual({
      ok: true,
      stdout: `openapi-to-trpc: ${input} (effect)`,
      stderr: '',
    })
    expect(fs.existsSync(path.join(dir, 'types.ts'))).toBe(true)
  })

  it('reports an invalid config', async () => {
    const config = path.join(useTmpDir(), 'trpc.config.ts')
    fs.writeFileSync(config, "export default { input: 'openapi.txt' }\n")

    const result = await runCli(['--config', config])

    expect(result.ok).toBe(false)
    expect(result.stderr).toContain('Invalid config: input: must be .yaml | .yml | .json | .tsp')
  })
})

describe('openapi-to-trpc mode resolution', () => {
  it.each([
    [
      ['--config', 'vite.config.ts', path.join(SPECS, 'openapi.yaml')],
      '--config cannot be combined with <input>, --output or --schema.',
    ],
    [['-o', 'routes'], '--output and --schema describe an <input> document.'],
    // The working directory (this package) has no config file.
    [[], `Config not found: ${path.resolve('openapi-to-trpc.config.ts')}`],
  ])('answers %j with the help and why', async (argv, message) => {
    const result = await runCli(argv)

    expect(result.ok).toBe(false)
    expect(result.stdout).toContain('USAGE')
    expect(result.stderr).toContain(message)
  })

  /**
   * The generator pipeline is loaded through `import()` inside the handler, so `--help`,
   * `--version` and every rejected command line do not pay for the TypeSpec compiler, the
   * OpenAPI parser and ts-morph. Reading the source keeps this from being a flaky benchmark.
   */
  it('loads the generators lazily, so the built-in flags stay fast', () => {
    const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf-8')

    for (const heavy of ['../config/index.js', '../core/index.js']) {
      expect(source).not.toContain(`from '${heavy}'`)
      expect(source).toContain(`import('${heavy}')`)
    }
  })
})

describe('openapi-to-trpc --help / --version', () => {
  it('prints the help the README shows as its CLI Reference', async () => {
    const readme = fs.readFileSync(new URL('../../README.md', import.meta.url), 'utf-8')
    const marker = '`openapi-to-trpc --help`:\n\n```text\n'
    const body = readme.indexOf(marker) + marker.length
    expect(body).toBeGreaterThan(marker.length)

    const result = await runCli(['--help'])

    expect(result.stdout.trimEnd()).toBe(readme.slice(body, readme.indexOf('\n```', body)))
  })

  it('prints the version from package.json', async () => {
    const { version } = JSON.parse(
      fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
    )

    const result = await runCli(['--version'])

    expect(result).toStrictEqual({ ok: true, stdout: `openapi-to-trpc v${version}`, stderr: '' })
  })
})

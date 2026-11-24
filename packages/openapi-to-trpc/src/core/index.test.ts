import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as NodeServices from '@effect/platform-node/NodeServices'
import { Effect } from 'effect'
import { parseOpenAPI } from 'oas-truth'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { parseConfig } from '../config/index.js'
import { makeFiles, openapiToTrpc } from './index.js'

const input = path.resolve(import.meta.dirname, '../../../../test/specs/openapi.yaml')

function config(value: object) {
  return Effect.runSync(parseConfig({ input, ...value }))
}

/** Generates against the real filesystem; a failure rejects with the generator's own error. */
function run(value: object) {
  return Effect.runPromise(openapiToTrpc(config(value)).pipe(Effect.provide(NodeServices.layer)))
}

/** The same, for a run that is expected to fail: answers with the error it failed with. */
function runError(value: object) {
  return Effect.runPromise(
    Effect.flip(openapiToTrpc(config(value))).pipe(Effect.provide(NodeServices.layer)),
  )
}

describe('makeFiles', () => {
  it('writes schemas to src/components and one router per first path segment by default', async () => {
    const openapi = await parseOpenAPI(config({}).input)
    if (!openapi.ok) throw new Error(openapi.error)
    const files = makeFiles(openapi.value, config({}))
    expect(files.map((file) => path.relative(process.cwd(), file.path))).toStrictEqual([
      'src/components/index.ts',
      'src/routes/posts.ts',
      'src/routes/user-profiles.ts',
      'src/routes/index.ts',
    ])
    expect(files[1]?.code.split('\n').slice(0, 4)).toStrictEqual([
      "import {initTRPC,TRPCError} from '@trpc/server'",
      "import * as z from 'zod'",
      "import {CreatePostSchema,PostSchema} from '../components'",
      '',
    ])
  })
})

describe('makeFiles components', () => {
  const openapi = {
    openapi: '3.2.0',
    info: { title: 'components', version: '1.0.0' },
    paths: {},
    components: {
      schemas: {
        user: { type: 'object', properties: { id: { type: 'string' } } },
        User: { type: 'object', properties: { name: { type: 'string' } } },
      },
      responses: {
        Named: {
          description: 'the second schema',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
        },
      },
      mediaTypes: { Text: { schema: { type: 'string' } } },
    },
  } as const
  const files = makeFiles(
    openapi,
    config({
      components: {
        schemas: { output: 'src/components/schemas.ts' },
        responses: { output: 'src/components/responses.ts' },
        mediaTypes: { output: 'src/components/mediaTypes.ts', exportTypes: true },
      },
    }),
  )
  const code = (file: string) => files.find((f) => f.path.endsWith(file))?.code

  it('points a $ref at the schema that took a suffixed identifier', () => {
    expect(code('responses.ts')).toContain('schema:User2Schema')
    expect(code('responses.ts')).toContain("import {User2Schema} from './schemas'")
  })

  it('leaves the schema types out when schemas.exportTypes is false', () => {
    const [schemas] = makeFiles(
      openapi,
      config({ components: { schemas: { output: 'src/schemas.ts', exportTypes: false } } }),
    )
    expect(schemas?.code).not.toContain('export type')
  })

  it('writes components.mediaTypes with their inferred types', () => {
    expect(code('mediaTypes.ts')).toBe(
      [
        "import * as z from 'zod'",
        '',
        'export const TextMediaTypeSchema=z.string()',
        '',
        'export type TextMediaTypeSchema=z.infer<typeof TextMediaTypeSchema>',
      ].join('\n'),
    )
  })
})

/** The line of `file` that imports `UserSchema` or the type of the `appRouter`. */
function importOf(files: readonly { path: string; code: string }[], file: string) {
  return files
    .find((f) => f.path.endsWith(file))
    ?.code.split('\n')
    .find((line) => /^import (?:type )?\{(?:UserSchema|appRouter)\}/u.test(line))
}

/** Every file under `packages/<name>/` in the package `name`, the rest in `server`. */
function packageRootOf(name: string) {
  return (file: string) => (file.includes(`/packages/${name}/`) ? name : 'server')
}

describe('makeFiles imports', () => {
  const openapi = {
    openapi: '3.2.0',
    info: { title: 'imports', version: '1.0.0' },
    paths: {
      '/users': {
        get: {
          responses: {
            '200': {
              description: 'a user',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
            },
          },
        },
      },
    },
    components: {
      schemas: { User: { type: 'object', properties: { id: { type: 'string' } } } },
      responses: {
        One: {
          description: 'a user',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
        },
      },
    },
  } as const

  it('imports under pathAlias what is in the directory that holds the router directory', () => {
    const files = makeFiles(
      openapi,
      config({
        pathAlias: '@/',
        components: {
          schemas: { output: 'src/components/schemas' },
          responses: { output: 'src/components/responses.ts' },
        },
        type: { output: 'src/types.ts' },
        client: { output: 'src/client.ts' },
      }),
    )
    expect(
      ['routes/users.ts', 'responses.ts', 'types.ts', 'client.ts'].map((file) =>
        importOf(files, file),
      ),
    ).toStrictEqual([
      "import {UserSchema} from '@/components/schemas'",
      "import {UserSchema} from '@/components/schemas'",
      "import type {appRouter} from '@/routes'",
      "import type {appRouter} from '@/routes'",
    ])
  })

  it('imports a components output of another package by its package', () => {
    const files = makeFiles(
      openapi,
      config({
        pathAlias: '@/',
        components: { output: 'packages/components/index.ts', package: '@packages/components' },
      }),
      packageRootOf('components'),
    )
    expect(importOf(files, 'routes/users.ts')).toBe(
      "import {UserSchema} from '@packages/components'",
    )
  })

  it('fails on a components output of another package that names no package', () => {
    expect(() =>
      makeFiles(
        openapi,
        config({ components: { schemas: { output: 'packages/schemas/index.ts' } } }),
        packageRootOf('schemas'),
      ),
    ).toThrow(
      'output imports components.schemas from another package: set components.schemas.package to the name of the package packages/schemas/index.ts is written into.',
    )
  })

  it('imports every effect module a router names', () => {
    const files = makeFiles(
      {
        openapi: '3.2.0',
        info: { title: 'int64', version: '1.0.0' },
        paths: {
          '/counters': {
            get: {
              parameters: [
                { name: 'min', in: 'query', schema: { type: 'integer', format: 'int64' } },
              ],
              responses: { '204': { description: 'none' } },
            },
          },
        },
      },
      config({ schema: 'effect' }),
    )
    const code = files.find((file) => file.path.endsWith('routes/counters.ts'))?.code ?? ''
    expect(code.split('\n').filter((line) => line.endsWith("from 'effect'"))).toStrictEqual([
      "import { Schema, SchemaTransformation } from 'effect'",
    ])
  })
})

/** The generated client file for `client`, written next to the default router directory. */
async function clientCode(client: object) {
  const openapi = await parseOpenAPI(config({}).input)
  if (!openapi.ok) throw new Error(openapi.error)
  return makeFiles(openapi.value, config({ client: { output: 'src/client.ts', ...client } }))
    .find((file) => file.path.endsWith('client.ts'))
    ?.code.split('\n')
}

describe('makeFiles client', () => {
  it('creates the client on the router type at a same-origin path', async () => {
    expect(await clientCode({})).toStrictEqual([
      "import {createTRPCClient,httpBatchLink} from '@trpc/client'",
      '',
      "import type {appRouter} from './routes'",
      '',
      'export const client=createTRPCClient<typeof appRouter>({links:[httpBatchLink({url:"/"})]})',
    ])
  })

  it.each([
    [{ baseUrl: '/trpc' }, '"/trpc"', []],
    [
      { baseUrl: { env: 'VITE_API_URL' } },
      'baseUrl',
      ['const baseUrl=import.meta.env.VITE_API_URL!'],
    ],
    [
      { baseUrl: { env: 'API_URL', source: 'process.env' } },
      'baseUrl',
      ['const baseUrl=process.env.API_URL!'],
    ],
    [
      { baseUrl: { env: 'API_URL', import: '@/env' } },
      'env.API_URL',
      ["import {env} from '@/env'"],
    ],
  ])('reads %j into the link url', async (client, url, lines) => {
    const code = await clientCode(client)
    expect(code?.at(-1)).toBe(
      `export const client=createTRPCClient<typeof appRouter>({links:[httpBatchLink({url:${url}})]})`,
    )
    expect(code).toStrictEqual(expect.arrayContaining(lines))
  })

  it('imports the router type from client.import and passes credentials through fetch', async () => {
    const code = await clientCode({ import: '@packages/server', credentials: 'include' })
    expect(code).toContain("import type {appRouter} from '@packages/server'")
    expect(code?.at(-1)).toBe(
      'export const client=createTRPCClient<typeof appRouter>({links:[httpBatchLink({url:"/",fetch:(input,{signal,...init}={})=>fetch(input,{...init,...(signal&&{signal}),credentials:"include"})})]})',
    )
  })
})

const EVENTS = `openapi: 3.1.0
info: { title: Events, version: 1.0.0 }
paths:
  /real-time-events:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { type: string }
  /user_profiles/{id}:
    get:
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        '200': { description: OK }
`

const STUB = /\.query\(\(\) => \{\s*throw new TRPCError\(\{ code: 'NOT_IMPLEMENTED' \}\)\s*\}\)/u

describe('fileNameCase', () => {
  let dir = ''
  const routes = () => path.join(dir, 'routes')
  const list = () => fs.readdirSync(routes()).sort()
  const read = (file: string) => fs.readFileSync(path.join(routes(), file), 'utf-8')
  const generate = (value: object = {}) =>
    run({
      input: path.join(dir, 'events.yaml'),
      output: routes(),
      components: { output: path.join(dir, 'components.ts') },
      ...value,
    })
  /** Replaces the stub of the one procedure of a router file with a resolver. */
  const implement = (file: string) => {
    const implemented = read(file).replace(STUB, ".query(() => 'live')")
    expect(implemented).toContain(".query(() => 'live')")
    fs.writeFileSync(path.join(routes(), file), implemented)
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-to-trpc-'))
    fs.writeFileSync(path.join(dir, 'events.yaml'), EVENTS)
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true })
  })

  it('names a fresh router file in kebab case and keeps the camelCase export and key', async () => {
    await generate()
    expect(list()).toStrictEqual(['index.ts', 'real-time-events.ts', 'user-profiles.ts'])
    expect(read('real-time-events.ts')).toBe(`import { initTRPC, TRPCError } from '@trpc/server'
import * as z from 'zod'

const t = initTRPC.create()

export const realTimeEventsRouter = t.router({
  getRealTimeEvents: t.procedure.output(z.string()).query(() => {
    throw new TRPCError({ code: 'NOT_IMPLEMENTED' })
  }),
})
`)
    expect(read('index.ts')).toBe(`import { initTRPC } from '@trpc/server'
import { realTimeEventsRouter } from './real-time-events'
import { userProfilesRouter } from './user-profiles'

const t = initTRPC.create()

export const appRouter = t.router({
  realTimeEvents: realTimeEventsRouter,
  userProfiles: userProfilesRouter,
})
`)
  })

  it("names a fresh router file after the router with 'camelCase'", async () => {
    await generate({ fileNameCase: 'camelCase' })
    expect(list()).toStrictEqual(['index.ts', 'realTimeEvents.ts', 'userProfiles.ts'])
    expect(read('index.ts')).toContain("import { realTimeEventsRouter } from './realTimeEvents'")
  })

  it('keeps an implemented resolver when regenerating', async () => {
    await generate()
    implement('real-time-events.ts')
    await generate()
    expect(list()).toStrictEqual(['index.ts', 'real-time-events.ts', 'user-profiles.ts'])
    expect(read('real-time-events.ts')).toContain(".query(() => 'live')")
  })

  it.each([
    ['camelCase', 'kebab-case', 'realTimeEvents'],
    ['kebab-case', 'camelCase', 'real-time-events'],
  ])('keeps the files of a project generated in %s when switched to %s', async (from, to, file) => {
    await generate({ fileNameCase: from })
    const before = list()
    implement(`${file}.ts`)
    await generate({ fileNameCase: to })
    expect(list()).toStrictEqual(before)
    expect(read(`${file}.ts`)).toContain(".query(() => 'live')")
    expect(read('index.ts')).toContain(`import { realTimeEventsRouter } from './${file}'`)
  })

  it.each(['kebab-case', 'camelCase'])(
    'keeps a file renamed by hand in the app router with %s',
    async (fileNameCase) => {
      await generate({ fileNameCase })
      const [events, profiles] =
        fileNameCase === 'kebab-case'
          ? ['real-time-events.ts', 'user-profiles.ts']
          : ['realTimeEvents.ts', 'userProfiles.ts']
      implement(events)
      fs.renameSync(path.join(routes(), events), path.join(routes(), 'real_time_events.ts'))
      fs.renameSync(path.join(routes(), profiles), path.join(routes(), 'UserProfiles.ts'))
      await generate({ fileNameCase })
      expect(list()).toStrictEqual(['UserProfiles.ts', 'index.ts', 'real_time_events.ts'])
      expect(read('real_time_events.ts')).toContain(".query(() => 'live')")
      expect(read('index.ts')).toContain(
        "import { realTimeEventsRouter } from './real_time_events'",
      )
      expect(read('index.ts')).toContain("import { userProfilesRouter } from './UserProfiles'")
    },
  )

  it('takes the file named as expected before one that only matches loosely', async () => {
    await generate()
    fs.writeFileSync(path.join(routes(), 'realTimeEvents.ts'), 'export const helper = 1\n')
    implement('real-time-events.ts')
    await generate()
    expect(read('realTimeEvents.ts')).toBe('export const helper = 1\n')
    expect(read('real-time-events.ts')).toContain(".query(() => 'live')")
  })

  it('takes no generated file of the router directory for the file of a router', async () => {
    const value = { type: { output: path.join(routes(), 'real_time_events.ts') } }
    await generate(value)
    await generate(value)
    expect(list()).toStrictEqual([
      'index.ts',
      'real-time-events.ts',
      'real_time_events.ts',
      'user-profiles.ts',
    ])
    expect(read('real_time_events.ts')).toContain('export type RouterInputs')
    expect(read('real_time_events.ts')).not.toContain('realTimeEventsRouter')
  })

  it('keeps the camelCase names of routers that kebab case would give one file', async () => {
    fs.writeFileSync(
      path.join(dir, 'events.yaml'),
      `openapi: 3.1.0
info: { title: Keys, version: 1.0.0 }
paths:
  /userAPIKeys:
    get:
      responses:
        '200': { description: OK }
  /user-api-keys:
    get:
      responses:
        '200': { description: OK }
  /2fa:
    get:
      responses:
        '200': { description: OK }
`,
    )
    await generate()
    expect(list()).toStrictEqual(['2fa.ts', 'index.ts', 'userAPIKeys.ts', 'userApiKeys.ts'])
    expect(read('index.ts')).toContain("import { _2faRouter } from './2fa'")
  })
})

describe('openapiToTrpc', () => {
  it('keeps an implemented resolver when regenerating', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-to-trpc-'))
    const value = {
      output: path.join(dir, 'routes'),
      components: { output: path.join(dir, 'components.ts') },
    }
    const router = path.join(dir, 'routes/user-profiles.ts')
    await run(value)
    const stub = fs.readFileSync(router, 'utf-8')
    const implemented = stub.replace(
      /\.query\(\(\) => \{\s*throw new TRPCError\(\{ code: 'NOT_IMPLEMENTED' \}\)\s*\}\)/u,
      ".query(({ input }) => ({ user: { id: input.userId, name: 'Ada' } }))",
    )
    expect(implemented).not.toBe(stub)
    fs.writeFileSync(router, implemented)
    await run(value)
    expect(fs.readFileSync(router, 'utf-8')).toBe(implemented)
    fs.rmSync(dir, { recursive: true })
  })

  it('finds the package of each output by the nearest package.json', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-to-trpc-'))
    for (const name of ['server', 'components']) {
      fs.mkdirSync(path.join(dir, name), { recursive: true })
      fs.writeFileSync(path.join(dir, name, 'package.json'), '{}')
    }
    const value = {
      output: path.join(dir, 'server/src/routes'),
      components: { schemas: { output: path.join(dir, 'components/src/index.ts') } },
    }
    expect(await runError(value)).toMatchObject({
      _tag: 'GenerateError',
      message: expect.stringContaining(
        'output imports components.schemas from another package: set components.schemas.package',
      ),
    })
    await run({
      ...value,
      components: { schemas: { ...value.components.schemas, package: '@packages/components' } },
    })
    expect(fs.readFileSync(path.join(dir, 'server/src/routes/posts.ts'), 'utf-8')).toContain(
      "from '@packages/components'",
    )
    fs.rmSync(dir, { recursive: true })
  })

  it('reports an unreadable input', async () => {
    expect(await runError({ input: 'missing.yaml' })).toMatchObject({ _tag: 'GenerateError' })
  })
})

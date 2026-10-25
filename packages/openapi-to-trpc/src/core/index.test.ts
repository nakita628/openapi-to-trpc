import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as NodeServices from '@effect/platform-node/NodeServices'
import { Effect } from 'effect'
import { parseOpenAPI } from 'oas-truth'
import { describe, expect, it } from 'vite-plus/test'

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
    const openapi = await parseOpenAPI(input)
    if (!openapi.ok) throw new Error(openapi.error)
    const files = makeFiles(openapi.value, config({}))
    expect(files.map((file) => path.relative(process.cwd(), file.path))).toStrictEqual([
      'src/components/index.ts',
      'src/routes/posts.ts',
      'src/routes/userProfiles.ts',
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
})

/** The generated client file for `client`, written next to the default router directory. */
async function clientCode(client: object) {
  const openapi = await parseOpenAPI(input)
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

describe('openapiToTrpc', () => {
  it('keeps an implemented resolver when regenerating', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-to-trpc-'))
    const value = {
      output: path.join(dir, 'routes'),
      components: { output: path.join(dir, 'components.ts') },
    }
    const router = path.join(dir, 'routes/userProfiles.ts')
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

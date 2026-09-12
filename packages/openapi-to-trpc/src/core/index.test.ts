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

  it('reports an unreadable input', async () => {
    expect(await runError({ input: 'missing.yaml' })).toMatchObject({ _tag: 'GenerateError' })
  })
})

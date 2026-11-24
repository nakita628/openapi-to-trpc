import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { OUT } from './setup.js'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('generated routers', () => {
  it.each(['zod', 'valibot', 'arktype', 'effect'])(
    'validate at runtime with %s',
    async (schema) => {
      const { appRouter } = await import(`./__generated__/${schema}/routes/index.ts`)
      const caller = appRouter.createCaller({})
      await expect(caller.posts.getPostsPostId({ postId: 0 })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
      await expect(caller.posts.putPostsPostId({ postId: 1, title: 'a' })).rejects.toMatchObject({
        code: 'NOT_IMPLEMENTED',
      })
    },
  )

  it.each(['zod', 'valibot', 'arktype', 'effect'])(
    'load recursive schemas with %s',
    async (schema) => {
      const { appRouter } = await import(`./__generated__/recursive/${schema}/routes/index.ts`)
      await expect(appRouter.createCaller({}).categories.getCategories()).rejects.toMatchObject({
        code: 'NOT_IMPLEMENTED',
      })
    },
  )

  it('calls the router over HTTP through the generated client', async () => {
    const { appRouter } = await import('./__generated__/zod/routes/index.ts')
    const requests: RequestInit[] = []
    // The client's link calls the global fetch; it is answered by the generated router behind
    // tRPC's fetch adapter, mounted where API_URL points.
    vi.stubEnv('API_URL', 'http://localhost/trpc')
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      requests.push(init)
      return fetchRequestHandler({
        endpoint: '/trpc',
        req: new Request(input, init),
        router: appRouter,
        createContext: () => ({}),
      })
    })
    const { client } = await import('./__generated__/zod/client.ts')
    await expect(client.posts.getPostsPostId.query({ postId: 0 })).rejects.toMatchObject({
      data: { code: 'BAD_REQUEST' },
    })
    await expect(
      client.posts.putPostsPostId.mutate({ postId: 1, title: 'a' }),
    ).rejects.toMatchObject({ data: { code: 'NOT_IMPLEMENTED' } })
    expect(requests.map((request) => request.credentials)).toStrictEqual(['include', 'include'])
  })

  // Where each layout's client sends its requests (see LAYOUTS in setup.ts), and so where the
  // router is mounted: the zod and effect clients read it from the environment, the arktype one
  // from its env module, and the valibot one is left on the default, the same-origin `/`.
  it.each([
    ['zod', '/trpc'],
    ['valibot', '/'],
    ['arktype', '/trpc'],
    ['effect', '/trpc'],
  ])('sends an int64 a resolver returns to the %s client as a bigint', async (schema, endpoint) => {
    const { appRouter } = await import(`./__generated__/${schema}/routes/index.ts`)
    vi.stubEnv('API_URL', 'http://localhost/trpc')
    vi.stubEnv('VITE_API_URL', 'http://localhost/trpc')
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) =>
      fetchRequestHandler({
        endpoint,
        // The valibot client asks for a same-origin path, which a page resolves on its origin.
        req: new Request(
          new URL(input instanceof Request ? input.url : input, 'http://localhost'),
          init,
        ),
        router: appRouter,
        createContext: () => ({}),
      }),
    )
    const { client } = await import(`./__generated__/${schema}/client.ts`)
    // The output validator decodes `views` into a bigint, which JSON alone cannot carry.
    expect(await client.posts.getPostsPostId.query({ postId: 1 })).toStrictEqual({
      id: 1,
      title: 'a',
      author: { id: '00000000-0000-4000-8000-000000000000', name: 'n' },
      views: 5n,
    })
  })

  it('does not annotate effect recursive schemas as Codec<any>', () => {
    const code = fs.readFileSync(path.join(OUT, 'recursive/effect/components.ts'), 'utf-8')
    expect(code).not.toContain('Schema.Codec<any>')
  })

  it('type-check with tsc', () => {
    const dir = import.meta.dirname
    const output = (() => {
      try {
        return execFileSync(path.join(dir, 'node_modules/.bin/tsc'), ['-p', dir], {
          encoding: 'utf-8',
        })
      } catch (error) {
        return error instanceof Error && 'stdout' in error ? String(error.stdout) : String(error)
      }
    })()
    expect(output).toBe('')
  })
})

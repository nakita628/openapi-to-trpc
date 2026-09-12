import { execFileSync } from 'node:child_process'
import path from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import { generate, OUT } from './setup.js'

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

  it.each(['zod', 'valibot', 'effect'])('load recursive schemas with %s', async (schema) => {
    const { appRouter } = await import(`./__generated__/recursive/${schema}/routes/index.ts`)
    await expect(appRouter.createCaller({}).categories.getCategories()).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    })
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

  it('reject recursive schemas with arktype', async () => {
    const root = path.join(OUT, 'recursive', 'arktype')
    await expect(
      generate('recursive.yaml', 'arktype', root, { output: 'components.ts' }),
    ).rejects.toMatchObject({
      _tag: 'GenerateError',
      message:
        'arktype does not support recursive schemas: CommentSchema, CategorySchema, CategoryRefSchema',
    })
  })
})

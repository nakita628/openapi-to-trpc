import { describe, expect, it } from 'vite-plus/test'

import { mergeRouter } from './index.js'

const generated = `import {initTRPC,TRPCError} from '@trpc/server'
import * as z from 'zod'
import {PostSchema} from '../components'

const t=initTRPC.create()

export const postsRouter=t.router({getPosts:t.procedure.output(z.array(PostSchema)).query(()=>{throw new TRPCError({code:'NOT_IMPLEMENTED'})}),postPosts:t.procedure.input(PostSchema).mutation(()=>{throw new TRPCError({code:'NOT_IMPLEMENTED'})})})`

describe('mergeRouter', () => {
  it('returns the generated code when there is no router to merge into', () => {
    expect(mergeRouter('export const answer = 42\n', generated)).toBe(generated)
  })

  it('keeps hand-written code and resolvers, regenerating imports and procedure chains', () => {
    const existing = `import { initTRPC } from '@trpc/server'
import { OldSchema } from '../components'
import { db } from '../db'

const t = initTRPC.context<{ userId: string }>().create()

const take = 10

export const postsRouter = t.router({
  getPosts: t.procedure.output(OldSchema).query(async () => db.posts.findMany({ take })),
  deletePosts: t.procedure.mutation(async () => db.posts.deleteMany()),
})
`
    expect(mergeRouter(existing, generated)).toBe(`import {initTRPC,TRPCError} from '@trpc/server'
import * as z from 'zod'
import {PostSchema} from '../components'


import { db } from '../db'

const t = initTRPC.context<{ userId: string }>().create()

const take = 10

export const postsRouter = t.router({getPosts:t.procedure.output(z.array(PostSchema)).query(async () => db.posts.findMany({ take })),postPosts:t.procedure.input(PostSchema).mutation(()=>{throw new TRPCError({code:'NOT_IMPLEMENTED'})})})
`)
  })
})

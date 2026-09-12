import { describe, expect, it } from 'vite-plus/test'

import { mergeRouter } from './index.js'

const generated = `import {initTRPC,TRPCError} from '@trpc/server'
import * as z from 'zod'
import {PostSchema} from '../components'

const t=initTRPC.create()

export const postsRouter=t.router({getPosts:t.procedure.output(z.array(PostSchema)).query(()=>{throw new TRPCError({code:'NOT_IMPLEMENTED'})}),postPosts:t.procedure.input(PostSchema).mutation(()=>{throw new TRPCError({code:'NOT_IMPLEMENTED'})})})`

describe('mergeRouter', () => {
  it('keeps the code of a file without the router and appends the generated declarations it lacks', () => {
    const existing = `import { db } from '../db'

const t = initTRPC.create()

export const helper = () => db.posts.count()
`
    expect(mergeRouter(existing, generated)).toBe(`import {initTRPC,TRPCError} from '@trpc/server'
import * as z from 'zod'
import {PostSchema} from '../components'
import { db } from '../db'

const t = initTRPC.create()

export const helper = () => db.posts.count()


export const postsRouter=t.router({getPosts:t.procedure.output(z.array(PostSchema)).query(()=>{throw new TRPCError({code:'NOT_IMPLEMENTED'})}),postPosts:t.procedure.input(PostSchema).mutation(()=>{throw new TRPCError({code:'NOT_IMPLEMENTED'})})})`)
  })

  it('keeps hand-written code and resolvers, regenerating imports and the input and output', () => {
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

export const postsRouter = t.router({
  getPosts: t.procedure.output(z.array(PostSchema)).query(async () => db.posts.findMany({ take })),
postPosts:t.procedure.input(PostSchema).mutation(()=>{throw new TRPCError({code:'NOT_IMPLEMENTED'})})})
`)
  })

  it('keeps the procedure a resolver builds on, its middleware, its metadata and comments', () => {
    const existing = `export const postsRouter = t.router({
  // Signed-in users only
  getPosts: authed.use(audit).meta({ cache: true }).output(OldSchema).query(async () => []),
  postPosts: authed.input(OldSchema).mutation(async ({ input }) => db.posts.create(input)),
})
`
    expect(mergeRouter(existing, generated)).toBe(`import {initTRPC,TRPCError} from '@trpc/server'
import * as z from 'zod'
import {PostSchema} from '../components'
export const postsRouter = t.router({
  // Signed-in users only
  getPosts: authed.use(audit).meta({ cache: true }).output(z.array(PostSchema)).query(async () => []),
  postPosts: authed.input(PostSchema).mutation(async ({ input }) => db.posts.create(input)),
})
`)
  })

  it('adds the input and output the document declares and drops the ones it no longer does', () => {
    const existing = `export const postsRouter = t.router({
  getPosts: t.procedure.input(OldSchema).query(async () => []),
  postPosts: t.procedure.mutation(async () => null),
})
`
    expect(mergeRouter(existing, generated)).toContain(`export const postsRouter = t.router({
  getPosts: t.procedure.output(z.array(PostSchema)).query(async () => []),
  postPosts: t.procedure.input(PostSchema).mutation(async () => null),
})`)
  })

  it('keeps router entries that are not procedures', () => {
    const existing = `export const postsRouter = t.router({
  ...shared,
  admin: adminRouter,
  getPosts: getPostsProcedure
})
`
    expect(mergeRouter(existing, generated)).toContain(`export const postsRouter = t.router({
  ...shared,
  admin: adminRouter,
  getPosts: getPostsProcedure
,postPosts:t.procedure.input(PostSchema).mutation(()=>{throw new TRPCError({code:'NOT_IMPLEMENTED'})})})`)
  })
})

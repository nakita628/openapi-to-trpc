import { initTRPC } from '@trpc/server'

import { todosRouter } from './todos'

const t = initTRPC.create()

export const appRouter = t.router({ todos: todosRouter })

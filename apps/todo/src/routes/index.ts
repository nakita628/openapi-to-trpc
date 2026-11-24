import { initTRPC } from '@trpc/server'
import superjson from 'superjson'

import { todosRouter } from './todos'

const t = initTRPC.create({ transformer: superjson })

export const appRouter = t.router({ todos: todosRouter })

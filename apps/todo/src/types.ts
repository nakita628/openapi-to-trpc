import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

import type { appRouter } from './routes'

export type RouterInputs = inferRouterInputs<typeof appRouter>
export type RouterOutputs = inferRouterOutputs<typeof appRouter>

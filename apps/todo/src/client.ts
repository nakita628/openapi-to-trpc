import { createTRPCClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'

import type { appRouter } from './routes'

const baseUrl = process.env.API_URL!

export const client = createTRPCClient<typeof appRouter>({
  links: [httpBatchLink({ url: baseUrl, transformer: superjson })],
})

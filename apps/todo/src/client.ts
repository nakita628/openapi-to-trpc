import { createTRPCClient, httpBatchLink } from '@trpc/client'

import type { appRouter } from './routes'

const baseUrl = process.env.API_URL!

export const client = createTRPCClient<typeof appRouter>({
  links: [httpBatchLink({ url: baseUrl })],
})

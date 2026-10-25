import { createHTTPServer } from '@trpc/server/adapters/standalone'

import { appRouter } from './routes'

/** Serves the `appRouter` under `/trpc`, where the client's `API_URL` points. */
export function startServer(port: number) {
  const server = createHTTPServer({ router: appRouter, basePath: '/trpc/' })
  return server.listen(port)
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000)
  startServer(port)
  console.log(`tRPC server on http://localhost:${port}/trpc`)
}

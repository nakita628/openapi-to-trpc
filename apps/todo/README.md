# Todo

A todo API on [tRPC](https://trpc.io/). The routers, the zod schemas, the router types and the client are generated from `openapi.yaml` by [openapi-to-trpc](../../packages/openapi-to-trpc); the resolvers in `src/routes/todos.ts` and the in-memory store in `src/store.ts` are written by hand.

## Setup

From the repository root:

```bash
pnpm install
pnpm build   # the openapi-to-trpc CLI runs from packages/openapi-to-trpc/dist
```

## Generate

Regenerate from `openapi.yaml` with `openapi-to-trpc.config.ts`:

```bash
pnpm generate
```

| File                            | Written by                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/components/index.ts`       | the generator, every run                                                                   |
| `src/routes/index.ts`           | the generator, every run (the `appRouter`)                                                 |
| `src/routes/todos.ts`           | the generator, merged: your resolvers are kept, `.input()` and `.output()` follow the spec |
| `src/types.ts`                  | the generator, every run (`RouterInputs` / `RouterOutputs`)                                |
| `src/client.ts`                 | the generator, every run (reads `API_URL`)                                                 |
| `src/store.ts`, `src/server.ts` | you                                                                                        |

Add an operation to `openapi.yaml` and run `pnpm generate`: the new procedure appears as a stub that throws `NOT_IMPLEMENTED`, next to the resolvers you already wrote.

## Run

```bash
pnpm dev     # tRPC server on http://localhost:3000/trpc, restarted on change
pnpm test    # the router through a caller, and the generated client over HTTP
```

```bash
curl -X POST localhost:3000/trpc/todos.postTodos \
  -H 'content-type: application/json' -d '{"title":"Buy milk"}'
# {"result":{"data":{"id":1,"title":"Buy milk","done":false,"createdAt":"..."}}}

curl 'localhost:3000/trpc/todos.getTodos?input=%7B%7D'
# {"result":{"data":[{"id":1,"title":"Buy milk","done":false,"createdAt":"..."}]}}
```

From TypeScript, through the generated client:

```ts
import { client } from './src/client' // API_URL=http://localhost:3000/trpc

const todo = await client.todos.postTodos.mutate({ title: 'Buy milk' })
await client.todos.patchTodosTodoId.mutate({ todoId: todo.id, done: true })
const done = await client.todos.getTodos.query({ done: true })
```

## Procedures

| Operation                | Procedure                 | Input                       |
| ------------------------ | ------------------------- | --------------------------- |
| `GET /todos`             | `todos.getTodos`          | `{ done? }`                 |
| `POST /todos`            | `todos.postTodos`         | `{ title }`                 |
| `GET /todos/{todoId}`    | `todos.getTodosTodoId`    | `{ todoId }`                |
| `PATCH /todos/{todoId}`  | `todos.patchTodosTodoId`  | `{ todoId, title?, done? }` |
| `DELETE /todos/{todoId}` | `todos.deleteTodosTodoId` | `{ todoId }`                |

An unknown `todoId` is a `NOT_FOUND` error; input the spec does not allow (an empty `title`, `todoId: 0`) is `BAD_REQUEST`.

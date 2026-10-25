import type { Server } from 'node:http'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { appRouter } from './routes'
import { startServer } from './server'
import { clearTodos } from './store'

/** The port the server got from the system (`listen(0)`). */
function portOf(server: Server) {
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('server is not on TCP')
  return address.port
}

beforeEach(() => {
  clearTodos()
})

describe('todos router', () => {
  const caller = appRouter.createCaller({})

  it('creates, lists, updates and deletes a todo', async () => {
    const created = await caller.todos.postTodos({ title: 'Write the example' })
    expect(created).toMatchObject({ id: 1, title: 'Write the example', done: false })

    await caller.todos.patchTodosTodoId({ todoId: created.id, done: true })
    expect(await caller.todos.getTodos({ done: true })).toMatchObject([{ id: 1, done: true }])
    expect(await caller.todos.getTodos({ done: false })).toStrictEqual([])

    await caller.todos.deleteTodosTodoId({ todoId: created.id })
    expect(await caller.todos.getTodos({})).toStrictEqual([])
  })

  it('answers NOT_FOUND for an id no todo has', async () => {
    await expect(caller.todos.getTodosTodoId({ todoId: 42 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'No todo has the id 42',
    })
  })

  it('rejects input the OpenAPI schema does not allow', async () => {
    await expect(caller.todos.postTodos({ title: '' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
})

describe('generated client', () => {
  const server = startServer(0)

  afterAll(() => {
    server.close()
    vi.unstubAllEnvs()
  })

  it('calls the server over HTTP', async () => {
    const port = portOf(server)
    // The client reads API_URL when it is created, as the config's baseUrl says.
    vi.stubEnv('API_URL', `http://localhost:${port}/trpc`)
    const { client } = await import('./client')

    const created = await client.todos.postTodos.mutate({ title: 'Call it over HTTP' })
    expect(await client.todos.getTodosTodoId.query({ todoId: created.id })).toStrictEqual(created)
    await expect(client.todos.getTodosTodoId.query({ todoId: 99 })).rejects.toMatchObject({
      data: { code: 'NOT_FOUND' },
    })
  })
})

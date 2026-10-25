import { initTRPC, TRPCError } from '@trpc/server'
import * as z from 'zod'

import { CreateTodoSchema, TodoSchema } from '../components'
import { createTodo, deleteTodo, findTodo, listTodos, updateTodo } from '../store'

const t = initTRPC.create()

function notFound(id: number): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: `No todo has the id ${id}` })
}

export const todosRouter = t.router({
  getTodos: t.procedure
    .input(z.object({ done: z.boolean().exactOptional() }))
    .output(z.array(TodoSchema))
    .query(({ input }) => listTodos(input.done)),
  postTodos: t.procedure
    .input(CreateTodoSchema)
    .output(TodoSchema)
    .mutation(({ input }) => createTodo(input.title)),
  getTodosTodoId: t.procedure
    .input(z.object({ todoId: z.int().min(1) }))
    .output(TodoSchema)
    .query(({ input }) => findTodo(input.todoId) ?? notFound(input.todoId)),
  deleteTodosTodoId: t.procedure
    .input(z.object({ todoId: z.int().min(1) }))
    .mutation(({ input }) => {
      if (!deleteTodo(input.todoId)) notFound(input.todoId)
    }),
  patchTodosTodoId: t.procedure
    .input(
      z.object({
        todoId: z.int().min(1),
        title: z.string().min(1).max(100).exactOptional(),
        done: z.boolean().exactOptional(),
      }),
    )
    .output(TodoSchema)
    .mutation(({ input: { todoId, ...patch } }) => updateTodo(todoId, patch) ?? notFound(todoId)),
})

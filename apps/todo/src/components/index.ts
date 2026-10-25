import * as z from 'zod'

export const TodoSchema = z.object({
  id: z.int().min(1),
  title: z.string().min(1).max(100),
  done: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
})

export type TodoSchema = z.infer<typeof TodoSchema>

export const CreateTodoSchema = z.object({ title: z.string().min(1).max(100) })

export type CreateTodoSchema = z.infer<typeof CreateTodoSchema>

export const UpdateTodoSchema = z.object({
  title: z.string().min(1).max(100).exactOptional(),
  done: z.boolean().exactOptional(),
})

export type UpdateTodoSchema = z.infer<typeof UpdateTodoSchema>

import type { TodoSchema } from './components'

/** The todos, kept in memory for as long as the server runs. A real app reads a database here. */
const todos = new Map<number, TodoSchema>()
let lastId = 0

export function listTodos(done: boolean | undefined) {
  return [...todos.values()].filter((todo) => done === undefined || todo.done === done)
}

export function findTodo(id: number) {
  return todos.get(id)
}

export function createTodo(title: string) {
  lastId += 1
  const todo = { id: lastId, title, done: false, createdAt: new Date().toISOString() }
  todos.set(todo.id, todo)
  return todo
}

export function updateTodo(
  id: number,
  patch: { readonly title?: string; readonly done?: boolean },
) {
  const todo = todos.get(id)
  if (todo === undefined) return undefined
  const updated = { ...todo, ...patch }
  todos.set(id, updated)
  return updated
}

export function deleteTodo(id: number) {
  return todos.delete(id)
}

/** Empties the store; the tests start every case from no todos. */
export function clearTodos() {
  todos.clear()
  lastId = 0
}

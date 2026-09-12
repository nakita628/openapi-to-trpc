import { Project, SyntaxKind } from 'ts-morph'
import type { Node, ObjectLiteralExpression, PropertyAssignment, SourceFile } from 'ts-morph'

const RESOLVERS = new Set(['query', 'mutation', 'subscription'])

/** The procedure calls the generator owns: they come from the OpenAPI document. */
const CONTRACT = ['input', 'output'] as const

type Edit = { readonly start: number; readonly end: number; readonly text: string }

type Procedure = {
  readonly name: string
  readonly property: PropertyAssignment
  /** Where a missing `.input()` / `.output()` goes: right before `.query(…)`. */
  readonly resolverStart: number
  /** The `.input(…)` / `.output(…)` links of the chain and their ranges in the file. */
  readonly contract: ReadonlyMap<string, Edit>
}

/**
 * Regenerate a router file without losing hand-written code. The existing file is edited in
 * place, the way hono-takibi merges its handler files:
 *
 * - Procedures in both: the `.input()` / `.output()` calls are replaced by the generated ones;
 *   the resolver, the procedure it builds on (`t.procedure` or one with middleware), `.use()`,
 *   `.meta()` and comments are kept
 * - Procedures only in the generated router: added with the `NOT_IMPLEMENTED` stub
 * - Procedures only in the existing router: removed (the operation left the document); any other
 *   entry of the router object (a nested router, a spread) is kept
 * - Imports of every module the generator imports: replaced by the generated imports
 * - Everything else: kept. A file without the generated router gets the generated declarations it
 *   does not already have appended.
 */
export function mergeRouter(existing: string, generated: string) {
  const project = new Project({ useInMemoryFileSystem: true })
  const prev = project.createSourceFile('prev.ts', existing)
  const next = project.createSourceFile('next.ts', generated)
  const name = next
    .getVariableDeclarations()
    .map((decl) => decl.getName())
    .find((declName) => declName.endsWith('Router'))
  const nextRouter = name === undefined ? undefined : findRouter(next, name)
  if (name === undefined || nextRouter === undefined) return generated
  const prevRouter = findRouter(prev, name)

  const imports = next.getImportDeclarations()
  const managed = new Set(imports.map((decl) => decl.getModuleSpecifierValue()))
  const body = splice(existing, [
    ...prev
      .getImportDeclarations()
      .filter((decl) => managed.has(decl.getModuleSpecifierValue()))
      .map((decl) => ({ start: decl.getStart(), end: decl.getEnd(), text: '' })),
    ...(prevRouter === undefined
      ? [appendMissing(prev, next, existing.length)]
      : mergeProcedures(prevRouter, nextRouter)),
  ])
  return `${imports.map((decl) => decl.getText()).join('\n')}\n${body}`
}

/** The object literal passed to `t.router(...)` by the `name` declaration. */
function findRouter(file: SourceFile, name: string) {
  return file
    .getVariableDeclaration(name)
    ?.getInitializerIfKind(SyntaxKind.CallExpression)
    ?.getArguments()[0]
    ?.asKind(SyntaxKind.ObjectLiteralExpression)
}

/** The generated statements (`t`, the router) whose names the existing file does not declare. */
function appendMissing(prev: SourceFile, next: SourceFile, end: number): Edit {
  const declared = new Set(prev.getVariableDeclarations().map((decl) => decl.getName()))
  const missing = next
    .getVariableStatements()
    .filter((stmt) => stmt.getDeclarations().some((decl) => !declared.has(decl.getName())))
    .map((stmt) => stmt.getText())
  return { start: end, end, text: missing.map((text) => `\n\n${text}`).join('') }
}

function mergeProcedures(prev: ObjectLiteralExpression, next: ObjectLiteralExpression) {
  const generated = new Map(findProcedures(next).map((procedure) => [procedure.name, procedure]))
  const procedures = findProcedures(prev)
  const removed = new Set<Node>(
    procedures
      .filter((procedure) => !generated.has(procedure.name))
      .map((procedure) => procedure.property),
  )
  const names = new Set(
    prev.getProperties().flatMap((property) => {
      const named = property.asKind(SyntaxKind.PropertyAssignment)
      return named ? [named.getName()] : []
    }),
  )
  const added = [...generated.values()]
    .filter((procedure) => !names.has(procedure.name))
    .map((procedure) => procedure.property.getText())
  const last = prev.getProperties().findLast((property) => !removed.has(property))
  const separator = last && !hasComma(last) ? ',' : ''
  const close = prev.getEnd() - 1
  return [
    ...[...removed].map((property) => ({
      start: property.getFullStart(),
      end: property.getNextSiblingIfKind(SyntaxKind.CommaToken)?.getEnd() ?? property.getEnd(),
      text: '',
    })),
    ...procedures.flatMap((procedure) => {
      const update = generated.get(procedure.name)
      return update ? updateContract(procedure, update) : []
    }),
    ...(added.length > 0
      ? [{ start: close, end: close, text: `${separator}${added.join(',')}` }]
      : []),
  ]
}

/** Replace, remove or add the `.input()` / `.output()` links of an existing procedure. */
function updateContract(prev: Procedure, next: Procedure): readonly Edit[] {
  const replaced = CONTRACT.flatMap((method) => {
    const link = prev.contract.get(method)
    return link ? [{ ...link, text: next.contract.get(method)?.text ?? '' }] : []
  })
  const missing = CONTRACT.filter((method) => !prev.contract.has(method))
    .map((method) => next.contract.get(method)?.text ?? '')
    .join('')
  return missing === ''
    ? replaced
    : [...replaced, { start: prev.resolverStart, end: prev.resolverStart, text: missing }]
}

/** Each `name: <procedure>….query(resolver)` property of a router object. */
function findProcedures(router: ObjectLiteralExpression): readonly Procedure[] {
  return router.getProperties().flatMap((property) => {
    const assignment = property.asKind(SyntaxKind.PropertyAssignment)
    const call = assignment?.getInitializerIfKind(SyntaxKind.CallExpression)
    const callee = call?.getExpression().asKind(SyntaxKind.PropertyAccessExpression)
    return assignment && callee && RESOLVERS.has(callee.getName())
      ? [
          {
            name: assignment.getName(),
            property: assignment,
            resolverStart: callee.getExpression().getEnd(),
            contract: findContract(callee.getExpression()),
          },
        ]
      : []
  })
}

/**
 * Walks a procedure chain from the resolver down to the procedure it starts from, collecting the
 * contract calls. When a call repeats, the one nearest the start wins: that is where the generator
 * writes it.
 */
function findContract(node: Node): ReadonlyMap<string, Edit> {
  const callee = node
    .asKind(SyntaxKind.CallExpression)
    ?.getExpression()
    .asKind(SyntaxKind.PropertyAccessExpression)
  if (callee === undefined) return new Map()
  const nearer = findContract(callee.getExpression())
  const method = callee.getName()
  if (nearer.has(method) || !CONTRACT.some((name) => name === method)) return nearer
  const start = callee.getExpression().getEnd()
  const end = node.getEnd()
  const text = node.getSourceFile().getFullText().slice(start, end)
  return new Map([...nearer, [method, { start, end, text }]])
}

function hasComma(property: Node) {
  return property.getNextSiblingIfKind(SyntaxKind.CommaToken) !== undefined
}

function splice(text: string, edits: readonly Edit[]) {
  return edits
    .toSorted((a, b) => b.start - a.start)
    .reduce((acc, edit) => `${acc.slice(0, edit.start)}${edit.text}${acc.slice(edit.end)}`, text)
}

import { Project, SyntaxKind } from 'ts-morph'
import type { ObjectLiteralExpression, SourceFile } from 'ts-morph'

const RESOLVERS = new Set(['query', 'mutation', 'subscription'])

type Edit = { readonly start: number; readonly end: number; readonly text: string }

/**
 * Regenerate a router file without losing hand-written code: the existing file is kept as-is
 * except for the router object, which is replaced by the generated one with each surviving
 * procedure's resolver carried over, and the imports of every module the generator imports,
 * which are replaced by the generated imports.
 */
export function mergeRouter(existing: string, generated: string) {
  const project = new Project({ useInMemoryFileSystem: true })
  const prev = project.createSourceFile('prev.ts', existing)
  const next = project.createSourceFile('next.ts', generated)
  const prevRouter = findRouter(prev)
  const nextRouter = findRouter(next)
  if (prevRouter === undefined || nextRouter === undefined) return generated

  const kept = new Map(findResolvers(prevRouter).map(([name, node]) => [name, node.getText()]))
  const offset = nextRouter.getStart()
  const router = splice(
    nextRouter.getText(),
    findResolvers(nextRouter).flatMap(([name, node]) => {
      const text = kept.get(name)
      return text === undefined
        ? []
        : [{ start: node.getStart() - offset, end: node.getEnd() - offset, text }]
    }),
  )
  const imports = next.getImportDeclarations()
  const managed = new Set(imports.map((decl) => decl.getModuleSpecifierValue()))
  const body = splice(existing, [
    ...prev
      .getImportDeclarations()
      .filter((decl) => managed.has(decl.getModuleSpecifierValue()))
      .map((decl) => ({ start: decl.getStart(), end: decl.getEnd(), text: '' })),
    { start: prevRouter.getStart(), end: prevRouter.getEnd(), text: router },
  ])
  return `${imports.map((decl) => decl.getText()).join('\n')}\n${body}`
}

/** The object literal passed to `t.router(...)` by the exported `*Router` declaration. */
function findRouter(file: SourceFile) {
  return file
    .getVariableDeclarations()
    .find((decl) => decl.getName().endsWith('Router'))
    ?.getInitializerIfKind(SyntaxKind.CallExpression)
    ?.getArguments()[0]
    ?.asKind(SyntaxKind.ObjectLiteralExpression)
}

/** `[procedure, resolver]` for each `name: t.procedure….query(resolver)` property. */
function findResolvers(router: ObjectLiteralExpression) {
  return router.getProperties().flatMap((property) => {
    const assignment = property.asKind(SyntaxKind.PropertyAssignment)
    const call = assignment?.getInitializerIfKind(SyntaxKind.CallExpression)
    const callee = call?.getExpression().asKind(SyntaxKind.PropertyAccessExpression)
    const resolver = call?.getArguments()[0]
    return assignment && callee && resolver && RESOLVERS.has(callee.getName())
      ? [[assignment.getName(), resolver] as const]
      : []
  })
}

function splice(text: string, edits: readonly Edit[]) {
  return edits
    .toSorted((a, b) => b.start - a.start)
    .reduce((acc, edit) => `${acc.slice(0, edit.start)}${edit.text}${acc.slice(edit.end)}`, text)
}

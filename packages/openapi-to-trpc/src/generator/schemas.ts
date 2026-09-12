import { isRecord, makeSafeKey, schemaRefToName, toIdentifierPascalCase } from 'oas-truth'
import type { ComponentAdapter, Schema } from 'oas-truth'

import { LIBRARIES } from './library.js'
import type { Library } from './library.js'

export type Declaration = { readonly name: string; readonly code: string }

/** The identifier oas-truth emits for a `#/components/schemas/<name>` reference. */
export function schemaId(name: string) {
  return `${toIdentifierPascalCase(name)}Schema`
}

/**
 * `export const XSchema = …` per component schema, dependencies first so every bare reference is
 * initialized before use. A schema that reaches itself through `$ref`s gets lazy references to
 * its cycle and an explicit type, since TypeScript cannot infer a self-referencing `const`.
 */
export function makeSchemas(
  schemas: { readonly [k: string]: Schema },
  adapter: ComponentAdapter,
  library: Library,
): readonly Declaration[] {
  const deps = new Map(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      [...new Set(collectRefs(schema))].filter((ref) => ref in schemas),
    ]),
  )
  const recursion = LIBRARIES[library].recursion
  const cyclic = [...deps.keys()].filter((name) => reaches(deps, name, name)).map(schemaId)
  if (recursion === undefined && cyclic.length > 0) {
    throw new Error(`${library} does not support recursive schemas: ${cyclic.join(', ')}`)
  }
  const lazyRefs = new RegExp(`(?<![\\w$.])(?:${cyclic.join('|')})(?![\\w$])`, 'gu')

  return topologicalOrder(deps).flatMap((name) => {
    const schema = schemas[name]
    if (schema === undefined) return []
    const id = schemaId(name)
    const expr = adapter.toExpression(schema)
    if (!recursion || !cyclic.includes(id)) {
      return [{ name, code: `export const ${id}=${expr}\n\n${adapter.renderTypeInfer(id)}` }]
    }
    const type = makeType(schema, recursion.array)
    const lazy = expr.replace(lazyRefs, (ref) => recursion.lazy(ref))
    return [
      {
        name,
        code: `export type ${id}=${type}\n\nexport const ${id}:${recursion.annotate(id)}=${lazy}`,
      },
    ]
  })
}

function collectRefs(node: unknown): readonly string[] {
  if (Array.isArray(node)) return node.flatMap(collectRefs)
  if (!isRecord(node)) return []
  const ref =
    typeof node.$ref === 'string' && node.$ref.startsWith('#/components/schemas/')
      ? [schemaRefToName(node.$ref)]
      : []
  return [...ref, ...Object.values(node).flatMap(collectRefs)]
}

function reaches(
  deps: ReadonlyMap<string, readonly string[]>,
  from: string,
  to: string,
  seen = new Set<string>(),
): boolean {
  return (deps.get(from) ?? []).some((dep) => {
    if (dep === to) return true
    if (seen.has(dep)) return false
    seen.add(dep)
    return reaches(deps, dep, to, seen)
  })
}

function topologicalOrder(deps: ReadonlyMap<string, readonly string[]>): readonly string[] {
  const visited = new Set<string>()
  const visit = (name: string): readonly string[] => {
    if (visited.has(name)) return []
    visited.add(name)
    return [...(deps.get(name) ?? []).flatMap(visit), name]
  }
  return [...deps.keys()].flatMap(visit)
}

function isSchema(value: Schema | readonly Schema[] | boolean | undefined): value is Schema {
  return typeof value === 'object' && !Array.isArray(value)
}

/** The TypeScript type a schema validates; other components are referenced by their exported type. */
function makeType(schema: Schema, array: (type: string) => string): string {
  const type = (s: Schema) => makeType(s, array)
  if (schema.$ref) return schemaId(schemaRefToName(schema.$ref))
  const union = schema.oneOf ?? schema.anyOf
  if (union) return `(${union.map(type).join('|')})`
  if (schema.allOf) return `(${schema.allOf.map(type).join('&')})`
  if (schema.const !== undefined) return JSON.stringify(schema.const)
  if (schema.enum) return `(${schema.enum.map((value) => JSON.stringify(value)).join('|')})`
  const types =
    schema.type === undefined ? (schema.properties ? ['object'] : []) : [schema.type].flat()
  const members = [
    ...types.map((t) => {
      switch (t) {
        case 'string':
        case 'date':
          return 'string'
        case 'number':
        case 'integer':
          return 'number'
        case 'boolean':
        case 'null':
          return t
        case 'array':
          return array(isSchema(schema.items) ? type(schema.items) : 'unknown')
        default: {
          const required = new Set(schema.required)
          const properties = Object.entries(schema.properties ?? {}).map(([key, value]) =>
            required.has(key)
              ? `${makeSafeKey(key)}:${type(value)}`
              : `${makeSafeKey(key)}?:${type(value)}|undefined`,
          )
          if (properties.length > 0) return `{${properties.join(';')}}`
          const additional = schema.additionalProperties
          return `{[key:string]:${isSchema(additional) ? type(additional) : 'unknown'}}`
        }
      }
    }),
    ...(schema.nullable ? ['null'] : []),
  ]
  return members.length > 0 ? `(${members.join('|')})` : 'unknown'
}

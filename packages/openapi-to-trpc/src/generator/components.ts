import {
  makeAdapter,
  makeCallbacksCode,
  makeExamplesCode,
  makeHeadersCode,
  makeLinksCode,
  makeParametersCode,
  makePathItemsCode,
  makeRequestBodiesCode,
  makeResponsesCode,
  makeSchemaDeclarations,
  makeSecuritySchemesCode,
  toIdentifierPascalCase,
} from 'oas-truth'
import type { ComponentAdapter, Components, SchemaDeclaration } from 'oas-truth'

import { LIBRARIES } from './library.js'
import type { Library } from './library.js'

export const KINDS = [
  'schemas',
  'parameters',
  'headers',
  'responses',
  'requestBodies',
  'examples',
  'securitySchemes',
  'links',
  'callbacks',
  'pathItems',
] as const

export type Kind = (typeof KINDS)[number]

export type Declaration = {
  readonly name: string
  readonly code: string
  readonly fileName: string
}

export type Context = {
  readonly adapter: ComponentAdapter
  readonly library: Library
  readonly readonly: boolean
  /** Identifiers of every component schema (`UserSchema`, …), for import resolution. */
  readonly schemaIds: ReadonlySet<string>
  /** `components.schemas` as oas-truth emits them, including split file names. */
  readonly schemas: readonly SchemaDeclaration[]
}

const MAKERS: {
  readonly [K in Exclude<Kind, 'schemas'>]: (
    components: Components,
    context: Context,
    exportTypes: boolean,
  ) => string
} = {
  parameters: (c, { adapter }, exportTypes) => makeParametersCode(c, adapter, exportTypes),
  headers: (c, { adapter }, exportTypes) => makeHeadersCode(c, adapter, exportTypes),
  responses: (c, { adapter, readonly }) => makeResponsesCode(c, adapter, readonly),
  requestBodies: (c, { adapter, readonly }) => makeRequestBodiesCode(c, adapter, readonly),
  examples: (c, { readonly }) => makeExamplesCode(c, readonly),
  securitySchemes: (c, { readonly }) => makeSecuritySchemesCode(c, readonly),
  links: (c, { readonly }) => makeLinksCode(c, readonly),
  callbacks: (c, { adapter, readonly }) => makeCallbacksCode(c, adapter, readonly),
  pathItems: (c, { adapter, readonly }) => makePathItemsCode(c, adapter, readonly),
}

/** Adapter, schema declarations and the identifiers other modules import from them. */
export function makeContext(
  library: Library,
  readonly: boolean,
  schemas: Components['schemas'],
): Context {
  const adapter = makeAdapter(library)
  const declarations = makeSchemaDeclarations(schemas ?? {}, adapter, { exportTypes: true })
  return {
    adapter,
    library,
    readonly,
    schemaIds: new Set(declarations.map((declaration) => declaration.varName)),
    schemas: declarations,
  }
}

/** One declaration per component entry, so a kind can be bundled into one file or split. */
export function makeDeclarations(
  kind: Kind,
  components: Components,
  context: Context,
  exportTypes: boolean,
): readonly Declaration[] {
  if (kind === 'schemas') return context.schemas
  return Object.keys(components[kind] ?? {}).flatMap((name) => {
    const code = MAKERS[kind](only(components, kind, name), context, exportTypes)
      .split('\n')
      .filter((line) => !line.startsWith('import '))
      .join('\n')
      .trim()
    return code ? [{ name, code, fileName: uncapitalize(toIdentifierPascalCase(name)) }] : []
  })
}

/** Relative specifier from a split schema file to the file that declares `id`. */
export function schemaImportPath(context: Context, id: string) {
  const fileName =
    context.schemas.find((declaration) => declaration.varName === id)?.fileName ??
    uncapitalize(id.replace(/Schema$/u, ''))
  return `./${fileName}`
}

/** `components` narrowed to the single entry `name` of `kind`. */
function only(components: Components, kind: Exclude<Kind, 'schemas'>, name: string): Components {
  return { [kind]: { [name]: components[kind]?.[name] } }
}

/**
 * Prefix a code body with `header`, the validator import when the body uses the library, and a
 * named import (from `from(id)`) per component schema it references without declaring.
 */
export function makeModule(
  body: string,
  context: Context,
  from: (id: string) => string,
  header: readonly string[] = [],
) {
  const declared = new Set(
    Array.from(body.matchAll(/export (?:const|type) ([\w$]+)/gu), (m) => m[1]),
  )
  const refs = [...new Set(body.match(/(?<![\w$.])[A-Za-z_$][\w$]*/gu))]
    .filter((id) => context.schemaIds.has(id) && !declared.has(id))
    .toSorted()
  const library = LIBRARIES[context.library]
  return [
    ...header,
    ...(library.uses.test(body)
      ? [context.adapter.renderImport({ cyclic: /\bscope\(/u.test(body) })]
      : []),
    ...Array.from(
      Map.groupBy(refs, from),
      ([spec, ids]) => `import {${ids.join(',')}} from '${spec}'`,
    ),
    '',
    body,
  ].join('\n')
}

function uncapitalize(text: string) {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`
}

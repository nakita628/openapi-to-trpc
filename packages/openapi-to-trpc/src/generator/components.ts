import {
  declarationFileName,
  makeAdapter,
  makeCallbacksDeclarations,
  makeExamplesDeclarations,
  makeHeadersDeclarations,
  makeLinksDeclarations,
  makeMediaTypesDeclarations,
  makeParametersDeclarations,
  makePathItemsDeclarations,
  makeRequestBodiesDeclarations,
  makeResponsesDeclarations,
  makeSchemaDeclarations,
  makeSchemaIdentifiers,
  makeSecuritySchemesDeclarations,
} from 'oas-truth'
import type {
  ComponentAdapter,
  ComponentCodeOptions,
  ComponentDeclaration,
  Components,
  SchemaDeclaration,
} from 'oas-truth'

import { LIBRARIES } from './library.js'
import type { Library } from './library.js'

/** The Components Object sections, in hono-takibi's order: a bundled file declares them so. */
export const KINDS = [
  'schemas',
  'responses',
  'parameters',
  'examples',
  'requestBodies',
  'headers',
  'securitySchemes',
  'links',
  'callbacks',
  'pathItems',
  'mediaTypes',
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
  /**
   * OpenAPI key → identifier of every component schema (`user` → `User`, `User` → `User2`), so
   * a `$ref` from another component kind names the declaration oas-truth emitted for it.
   */
  readonly identifiers: ReadonlyMap<string, string>
  /** `components.schemas` as oas-truth emits them, including split file names. */
  readonly schemas: readonly SchemaDeclaration[]
}

const MAKERS: {
  readonly [K in Exclude<Kind, 'schemas'>]: (
    components: Components,
    adapter: ComponentAdapter,
    options: ComponentCodeOptions,
  ) => readonly ComponentDeclaration[]
} = {
  parameters: makeParametersDeclarations,
  headers: makeHeadersDeclarations,
  responses: makeResponsesDeclarations,
  requestBodies: makeRequestBodiesDeclarations,
  examples: (c, _adapter, options) => makeExamplesDeclarations(c, options),
  securitySchemes: (c, _adapter, options) => makeSecuritySchemesDeclarations(c, options),
  links: (c, _adapter, options) => makeLinksDeclarations(c, options),
  callbacks: makeCallbacksDeclarations,
  pathItems: makePathItemsDeclarations,
  mediaTypes: makeMediaTypesDeclarations,
}

/** Adapter, schema declarations and the identifiers other modules import from them. */
export function makeContext(
  library: Library,
  readonly: boolean,
  schemas: Components['schemas'],
  exportTypes: boolean,
): Context {
  const adapter = makeAdapter(library)
  const declarations = makeSchemaDeclarations(schemas ?? {}, adapter, { exportTypes })
  return {
    adapter,
    library,
    readonly,
    schemaIds: new Set(declarations.map((declaration) => declaration.varName)),
    identifiers: makeSchemaIdentifiers(schemas ?? {}),
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
  // `exportTypes` is read by the schema-valued kinds, `readonly` by the data kinds.
  return MAKERS[kind](components, context.adapter, {
    exportTypes,
    readonly: context.readonly,
    identifiers: context.identifiers,
  })
}

/** Relative specifier from a split schema file to the file that declares `id`. */
export function schemaImportPath(context: Context, id: string) {
  const fileName =
    context.schemas.find((declaration) => declaration.varName === id)?.fileName ??
    declarationFileName(id.replace(/Schema$/u, ''))
  return `./${fileName}`
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

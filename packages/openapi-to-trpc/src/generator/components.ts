import {
  makeCallbacksCode,
  makeExamplesCode,
  makeHeadersCode,
  makeLinksCode,
  makeParametersCode,
  makePathItemsCode,
  makeRequestBodiesCode,
  makeResponsesCode,
  makeSecuritySchemesCode,
} from 'oas-truth'
import type { ComponentAdapter, Components } from 'oas-truth'

import { LIBRARIES } from './library.js'
import type { Library } from './library.js'
import { makeSchemas } from './schemas.js'
import type { Declaration } from './schemas.js'

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

export type Context = {
  readonly adapter: ComponentAdapter
  readonly library: Library
  readonly readonly: boolean
  /** Identifiers of every component schema (`UserSchema`, …), for import resolution. */
  readonly schemaIds: ReadonlySet<string>
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

/** One declaration per component entry, so a kind can be bundled into one file or split. */
export function makeDeclarations(
  kind: Kind,
  components: Components,
  context: Context,
  exportTypes: boolean,
): readonly Declaration[] {
  if (kind === 'schemas') {
    return makeSchemas(components.schemas ?? {}, context.adapter, context.library)
  }
  return Object.keys(components[kind] ?? {}).flatMap((name) => {
    const code = MAKERS[kind](only(components, kind, name), context, exportTypes)
      .split('\n')
      .filter((line) => !line.startsWith('import '))
      .join('\n')
      .trim()
    return code ? [{ name, code }] : []
  })
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
  return [
    ...header,
    ...(LIBRARIES[context.library].uses.test(body) ? [context.adapter.renderImport()] : []),
    ...Array.from(
      Map.groupBy(refs, from),
      ([spec, ids]) => `import {${ids.join(',')}} from '${spec}'`,
    ),
    '',
    body,
  ].join('\n')
}

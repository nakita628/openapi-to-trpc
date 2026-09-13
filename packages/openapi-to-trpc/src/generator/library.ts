import { makeAdapter } from 'oas-truth'
import type { ComponentAdapter } from 'oas-truth'

export type Library = 'zod' | 'valibot' | 'arktype' | 'effect'

/**
 * What a tRPC host needs on top of oas-truth's adapter, per validator library.
 *
 * - `uses`: whether a code body needs the library import.
 * - `standard`: wraps a validator into something tRPC accepts (a Standard Schema).
 * - `importLine`: the import to emit when it is not `adapter.renderImport()` — arktype
 *   cycles become `scope({...})`, and oas-truth's `makeSchemasCode` upgrades that import
 *   the same way.
 */
export const LIBRARIES: {
  readonly [L in Library]: {
    readonly uses: RegExp
    readonly standard: (expr: string) => string
    readonly importLine?: (body: string) => string
  }
} = {
  zod: {
    uses: /\bz\./u,
    standard: (expr) => expr,
  },
  valibot: {
    uses: /\bv\./u,
    standard: (expr) => expr,
  },
  arktype: {
    uses: /\b(?:type|scope)\(/u,
    standard: (expr) => expr,
    importLine: (body) =>
      /\bscope\(/u.test(body)
        ? "import { type, scope } from 'arktype'"
        : "import { type } from 'arktype'",
  },
  effect: {
    uses: /\bSchema\./u,
    standard: (expr) => `Schema.toStandardSchemaV1(${expr})`,
  },
}

/**
 * oas-truth's Effect adapter annotates cycles as `Schema.Codec<any>`. That
 * widens the const, so `export type X = Schema.Schema.Type<typeof X>` becomes
 * `any` and tRPC `RouterOutputs` follow. Naming the helper type keeps the
 * inferred export.
 */
export function hostAdapter(library: Library): ComponentAdapter {
  const adapter = makeAdapter(library)
  if (library !== 'effect') return adapter
  return {
    ...adapter,
    cyclicAnnotation: (typeName) => `Schema.Codec<${typeName}>`,
  }
}

/**
 * Valibot's `v.optional` and Effect's `Schema.optional` include `| undefined`.
 * oas-truth's cyclic helper type does not, so `exactOptionalPropertyTypes`
 * rejects the annotation. Zod uses `.exactOptional()` and already matches.
 * Effect arrays are also `readonly`; the helper type is not.
 */
export function withExactOptionalPropertyTypes(library: Library, code: string) {
  if (library !== 'valibot' && library !== 'effect') return code
  const optionals = code.replaceAll(/\?:([^;}\n]+)/gu, (match, type: string) => {
    if (/\|\s*undefined$/u.test(type.trim())) return match
    return `?:${type.trimEnd()} | undefined`
  })
  if (library !== 'effect') return optionals
  return optionals.replaceAll(/(\?:)\s*(?!readonly )([^;}\n]*\[\])/gu, '?: readonly $2')
}

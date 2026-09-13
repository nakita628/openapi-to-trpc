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
 * Valibot's `v.optional` output includes `| undefined`. oas-truth's cyclic helper
 * type does not, so `exactOptionalPropertyTypes` rejects `v.GenericSchema<Helper>`.
 * Zod uses `.exactOptional()` and matches the helper; Effect annotates with `any`.
 */
export function withExactOptionalPropertyTypes(library: Library, code: string) {
  if (library !== 'valibot') return code
  return code.replaceAll(/\?:([^;}\n]+)/gu, (match, type: string) => {
    if (/\|\s*undefined$/u.test(type.trim())) return match
    return `?:${type.trimEnd()} | undefined`
  })
}

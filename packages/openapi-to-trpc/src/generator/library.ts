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

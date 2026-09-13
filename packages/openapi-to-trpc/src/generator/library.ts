export type Library = 'zod' | 'valibot' | 'arktype' | 'effect'

/**
 * What a tRPC host needs on top of oas-truth's adapter, per validator library.
 *
 * - `uses`: whether a code body needs the library import. arktype cycles are
 *   only `scope({...})`, so that form has to match as well as `type(`.
 * - `standard`: wraps a validator into something tRPC accepts (a Standard Schema).
 */
export const LIBRARIES: {
  readonly [L in Library]: {
    readonly uses: RegExp
    readonly standard: (expr: string) => string
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
  },
  effect: {
    uses: /\bSchema\./u,
    standard: (expr) => `Schema.toStandardSchemaV1(${expr})`,
  },
}

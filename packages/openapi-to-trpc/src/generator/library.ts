export type Library = 'zod' | 'valibot' | 'arktype' | 'effect'

/**
 * What a tRPC host needs on top of oas-truth's adapter, per validator library.
 *
 * - `uses`: whether a code body needs the library import.
 * - `standard`: wraps a validator into something tRPC accepts (a Standard Schema).
 * - `recursion`: how a recursive component schema stays a valid `const` — a lazy reference
 *   (TDZ) plus an explicit annotation (TS7022). arktype has none: recursion there needs a `scope`.
 */
export const LIBRARIES: {
  readonly [L in Library]: {
    readonly uses: RegExp
    readonly standard: (expr: string) => string
    readonly recursion?: {
      readonly lazy: (id: string) => string
      readonly annotate: (type: string) => string
      readonly array: (type: string) => string
    }
  }
} = {
  zod: {
    uses: /\bz\./u,
    standard: (expr) => expr,
    recursion: {
      lazy: (id) => `z.lazy(()=>${id})`,
      annotate: (type) => `z.ZodType<${type}>`,
      array: (type) => `${type}[]`,
    },
  },
  valibot: {
    uses: /\bv\./u,
    standard: (expr) => expr,
    recursion: {
      lazy: (id) => `v.lazy(()=>${id})`,
      annotate: (type) => `v.GenericSchema<${type}>`,
      array: (type) => `${type}[]`,
    },
  },
  arktype: {
    uses: /\btype\(/u,
    standard: (expr) => expr,
  },
  effect: {
    uses: /\bSchema\./u,
    standard: (expr) => `Schema.toStandardSchemaV1(${expr})`,
    // oas-truth already emits every `$ref` as `Schema.suspend(() => XSchema)`.
    recursion: {
      lazy: (id) => id,
      annotate: (type) => `Schema.Codec<${type}>`,
      array: (type) => `readonly ${type}[]`,
    },
  },
}

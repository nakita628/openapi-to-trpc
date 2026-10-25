export type BaseUrl =
  | string
  | { readonly env: string; readonly source: 'import.meta.env' | 'process.env' }
  | { readonly env: string; readonly import: string; readonly name: string }

export type Credentials = 'include' | 'same-origin' | 'omit'

/**
 * The URL the link is created with. A path written into the file is a literal. One read from
 * the environment is read once, into `baseUrl`, and asserted present: the variable is the
 * deployment's to set, and a fallback would only hide its absence. One read from an environment
 * a module exports is that property, which the module answers for.
 */
function makeBaseUrl(baseUrl: BaseUrl) {
  if (typeof baseUrl === 'string') {
    return { imports: [], declarations: [], url: JSON.stringify(baseUrl) }
  }
  if ('import' in baseUrl) {
    return {
      imports: [`import {${baseUrl.name}} from '${baseUrl.import}'`],
      declarations: [],
      url: `${baseUrl.name}.${baseUrl.env}`,
    }
  }
  return {
    imports: [],
    declarations: [`const baseUrl=${baseUrl.source}.${baseUrl.env}!`],
    url: 'baseUrl',
  }
}

/**
 * The typed tRPC client: `createTRPCClient<typeof appRouter>` over one `httpBatchLink`. Only the
 * type of the router is imported (`appRouter` from `router`), so no server code reaches the
 * bundle. `credentials` is passed on by the link's `fetch`, the way the tRPC guide sends
 * cookies, and nothing is written without it.
 */
export function makeClient(router: string, baseUrl: BaseUrl, credentials?: Credentials) {
  const { imports, declarations, url } = makeBaseUrl(baseUrl)
  const fetch =
    credentials === undefined
      ? ''
      : // tRPC's `init` may carry `signal: undefined`, which the DOM `RequestInit` refuses under
        // `exactOptionalPropertyTypes`, so the signal is passed on only when there is one.
        `,fetch:(input,{signal,...init}={})=>fetch(input,{...init,...(signal&&{signal}),credentials:${JSON.stringify(credentials)}})`
  return [
    "import {createTRPCClient,httpBatchLink} from '@trpc/client'",
    '',
    ...imports,
    `import type {appRouter} from '${router}'`,
    '',
    ...declarations.flatMap((declaration) => [declaration, '']),
    `export const client=createTRPCClient<typeof appRouter>({links:[httpBatchLink({url:${url}${fetch}})]})`,
  ].join('\n')
}

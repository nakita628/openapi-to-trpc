import { schemaRefToName } from 'oas-truth'
import type {
  OpenAPI,
  Operation,
  Parameter,
  PathItem,
  Reference,
  RequestBody,
  Schema,
} from 'oas-truth'

import type { Context } from './components.js'
import { LIBRARIES } from './library.js'

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

/**
 * tRPC procedures grouped by router name (the first path segment), in document order. GET becomes
 * a query, every other method a mutation; path/query parameters and the JSON body are merged into
 * one input object, and the first 2xx JSON response becomes the output.
 */
export function makeProcedures(openapi: OpenAPI, context: Context) {
  const validator = (schema: Schema) =>
    LIBRARIES[context.library].standard(context.adapter.toExpression(schema))
  const procedures = Object.entries<PathItem>(openapi.paths).flatMap(([path, item]) =>
    METHODS.flatMap((method) => {
      const operation = item[method]
      if (operation === undefined) return []
      const input = makeInput(
        openapi,
        [...(item.parameters ?? []), ...(operation.parameters ?? [])],
        operation.requestBody,
      )
      const output = makeOutput(openapi, operation.responses)
      const chain = [
        input && `.input(${validator(input)})`,
        output && `.output(${validator(output)})`,
        `.${method === 'get' ? 'query' : 'mutation'}(()=>{throw new TRPCError({code:'NOT_IMPLEMENTED'})})`,
      ].join('')
      const name = `${method}${words(path).map(capitalize).join('')}`
      return [{ router: makeRouterName(path), code: `${name}:t.procedure${chain}` }]
    }),
  )
  return new Map(
    Array.from(
      Map.groupBy(procedures, (p) => p.router),
      ([router, list]) => [router, list.map((p) => p.code)],
    ),
  )
}

export function makeRouter(router: string, procedures: readonly string[]) {
  return `const t=initTRPC.create()\n\nexport const ${router}Router=t.router({${procedures.join(',')}})`
}

/** A router of the `appRouter`: its camelCase name, and the file it is in (without `.ts`). */
export type RouterFile = { readonly router: string; readonly file: string }

export function makeAppRouter(routers: readonly RouterFile[]) {
  return [
    "import {initTRPC} from '@trpc/server'",
    ...routers.map(({ router, file }) => `import {${router}Router} from './${file}'`),
    '',
    'const t=initTRPC.create()',
    '',
    `export const appRouter=t.router({${routers.map(({ router }) => `${router}:${router}Router`).join(',')}})`,
  ].join('\n')
}

/**
 * The file name each router is expected in, without `.ts`: the router name in kebab case, a
 * change of case being a word break and an acronym one word (`realTimeEvents` as
 * `real-time-events`, `userAPIKeys` as `user-api-keys`), as hono-takibi names its handler
 * files, or the router name itself with `camelCase`. Two routers can be expected in one file
 * (`userAPIKeys` and `userApiKeys`); the caller tells them apart.
 */
export function makeRouterFileNames(
  routers: readonly string[],
  fileNameCase: 'kebab-case' | 'camelCase',
) {
  return new Map(
    routers.map((router) => {
      const kebab = fileNameCase === 'kebab-case' ? toKebabCase(router) : ''
      return [router, kebab === '' ? router : kebab]
    }),
  )
}

function toKebabCase(name: string) {
  return name
    .replaceAll(/[^0-9A-Za-z]+/gu, '-')
    .replaceAll(/([a-z0-9])([A-Z])/gu, '$1-$2')
    .replaceAll(/([A-Z])([A-Z][a-z])/gu, '$1-$2')
    .replaceAll(/^-+|-+$/gu, '')
    .toLowerCase()
}

export function makeRouterTypes(appRouter: string) {
  return `import type {inferRouterInputs,inferRouterOutputs} from '@trpc/server'
import type {appRouter} from '${appRouter}'

export type RouterInputs=inferRouterInputs<typeof appRouter>
export type RouterOutputs=inferRouterOutputs<typeof appRouter>`
}

function makeInput(
  openapi: OpenAPI,
  parameters: readonly (Parameter | Reference)[],
  requestBody: RequestBody | Reference | undefined,
): Schema | undefined {
  const resolved = parameters.flatMap((p) => {
    const param = p.$ref ? openapi.components?.parameters?.[schemaRefToName(p.$ref)] : p
    return param && 'name' in param && (param.in === 'path' || param.in === 'query')
      ? [[`${param.in}:${param.name}`, param] as const]
      : []
  })
  // Operation-level parameters override path-level ones with the same location and name.
  const params = [...new Map(resolved).values()]
  const properties = Object.fromEntries(
    params.flatMap((p) => (p.schema ? [[p.name, p.schema]] : [])),
  )
  const required = params.filter((p) => p.in === 'path' || p.required === true).map((p) => p.name)
  const bodyObject =
    requestBody && '$ref' in requestBody && requestBody.$ref
      ? openapi.components?.requestBodies?.[schemaRefToName(requestBody.$ref)]
      : requestBody
  const body = bodyObject && 'content' in bodyObject ? jsonSchema(bodyObject.content) : undefined

  if (Object.keys(properties).length === 0) return body
  if (body === undefined) return { type: 'object', properties, required }
  const target = body.$ref ? openapi.components?.schemas?.[schemaRefToName(body.$ref)] : body
  if (target?.properties === undefined) {
    return { type: 'object', properties: { ...properties, body }, required: [...required, 'body'] }
  }
  // An object body is flattened next to the parameters; a parameter wins a clashing key.
  const isFree = (key: string) => !(key in properties)
  return {
    type: 'object',
    properties: {
      ...properties,
      ...Object.fromEntries(Object.entries(target.properties).filter(([key]) => isFree(key))),
    },
    required: [...required, ...(target.required ?? []).filter(isFree)],
  }
}

function makeOutput(openapi: OpenAPI, responses: Operation['responses']) {
  return Object.entries(responses)
    .filter(([status]) => /^2(?:\d\d|XX)$/u.test(status))
    .map(([, response]) =>
      jsonSchema(
        response.$ref
          ? openapi.components?.responses?.[schemaRefToName(response.$ref)]?.content
          : response.content,
      ),
    )
    .find((schema) => schema !== undefined)
}

function jsonSchema(content: RequestBody['content']): Schema | undefined {
  const media = Object.entries(content ?? {}).find(([type]) => /\bjson\b/u.test(type))?.[1]
  return media && 'schema' in media ? media.schema : undefined
}

/** `users` for `/users/{id}`, `userProfiles` for `/user-profiles`, `root` for `/` or `/{id}`. */
function makeRouterName(path: string) {
  const segment = path.split('/').find(Boolean)
  if (segment === undefined || segment.startsWith('{')) return 'root'
  const [head = '', ...rest] = words(segment)
  const name = `${head}${rest.map(capitalize).join('')}`
  return /^\d/u.test(name) ? `_${name}` : name
}

function words(text: string) {
  return text.split(/[^A-Za-z0-9]+/u).filter(Boolean)
}

function capitalize(text: string) {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

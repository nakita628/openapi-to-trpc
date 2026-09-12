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

export function makeAppRouter(routers: readonly string[]) {
  return [
    "import {initTRPC} from '@trpc/server'",
    ...routers.map((router) => `import {${router}Router} from './${router}'`),
    '',
    'const t=initTRPC.create()',
    '',
    `export const appRouter=t.router({${routers.map((r) => `${r}:${r}Router`).join(',')}})`,
  ].join('\n')
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

import { defineConfig } from 'openapi-to-trpc'

// oxlint-disable-next-line import/no-default-export -- openapi-to-trpc reads the config through its default export
export default defineConfig({
  input: 'openapi.yaml',
  schema: 'zod',
  output: 'src/routes',
  components: { schemas: { output: 'src/components/index.ts' } },
  type: { output: 'src/types.ts' },
  client: { output: 'src/client.ts', baseUrl: { env: 'API_URL', source: 'process.env' } },
  // The repository's own formatter sorts imports; the generated files follow it, so neither
  // rewrites the other.
  format: { sortImports: {} },
})

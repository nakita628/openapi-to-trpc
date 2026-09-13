import { describe, expect, it } from 'vite-plus/test'

import { withExactOptionalPropertyTypes } from './library.js'

describe('withExactOptionalPropertyTypes', () => {
  it('adds | undefined to optional fields on valibot cyclic helper types', () => {
    expect(
      withExactOptionalPropertyTypes(
        'valibot',
        'type CommentType = { body: string; replies?: CommentType[] }',
      ),
    ).toBe('type CommentType = { body: string; replies?: CommentType[] | undefined}')
  })

  it('leaves helper types for other libraries unchanged', () => {
    const code = 'type CommentType = { replies?: CommentType[] }'
    expect(withExactOptionalPropertyTypes('zod', code)).toBe(code)
  })

  it('does not add | undefined when it is already there', () => {
    const code = 'type CommentType = { replies?: CommentType[] | undefined }'
    expect(withExactOptionalPropertyTypes('valibot', code)).toBe(code)
  })
})

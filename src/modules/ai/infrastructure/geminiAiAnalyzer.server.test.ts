/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import {
  geminiAiModelSettings,
  geminiStructuredOutputMethod,
  geminiStructuredOutputSchemas,
  parseGeminiAiResult
} from './geminiAiAnalyzer.server'

describe('Gemini AI analyzer', () => {
  it.each(Object.entries(geminiStructuredOutputSchemas))(
    '%s uses only Gemini-supported schema keywords',
    (_mode, schema) => {
      const serialized = JSON.stringify(schema)

      expect(serialized).not.toContain('"const"')
      expect(serialized).not.toContain('"$ref"')
      expect(serialized).not.toContain('"minItems"')
      expect(serialized).not.toContain('"maxItems"')
      expect(schema).toEqual(expect.objectContaining({
        type: 'object',
        properties: expect.any(Object),
        required: expect.any(Array)
      }))
    }
  )

  it('uses Gemini native JSON schema output instead of tool calls', () => {
    expect(geminiStructuredOutputMethod).toBe('jsonSchema')
  })

  it('reserves enough output capacity for production-sized structured reviews', () => {
    expect(geminiAiModelSettings.maxOutputTokens).toBeGreaterThanOrEqual(8000)
  })

  it('recovers valid list-review entries from truncated raw JSON', () => {
    const result = parseGeminiAiResult('list_review', null, JSON.stringify({
        mode: 'list_review',
        duplicates: [{ keepKey: 'keep', removeKeys: ['remove'], reason: 'same item' }],
        renames: [{ key: 'key', currentName: 'old', suggestedName: 'new', reason: 'canonical' }]
      }))

    expect(result).toEqual({
      mode: 'list_review',
      duplicates: [{ keepKey: 'keep', removeKeys: ['remove'], reason: 'same item' }],
      renames: [{ key: 'key', currentName: 'old', suggestedName: 'new', reason: 'canonical' }]
    })
  })

  it('keeps the permitted number of valid review suggestions when Gemini over-returns', () => {
    const duplicate = { keepKey: 'keep', removeKeys: ['remove'], reason: 'same item' }
    const rename = {
      key: 'key',
      currentName: 'old',
      suggestedName: 'new',
      reason: 'canonical name'
    }

    const result = parseGeminiAiResult('list_review', {
      mode: 'list_review',
      duplicates: Array.from({ length: 31 }, (_, index) => ({
        ...duplicate,
        keepKey: `keep-${index}`
      })),
      renames: Array.from({ length: 51 }, (_, index) => ({ ...rename, key: `key-${index}` }))
    }, '')

    expect(result.mode).toBe('list_review')
    if (result.mode === 'list_review') {
      expect(result.duplicates).toHaveLength(12)
      expect(result.renames).toHaveLength(15)
    }
  })
})

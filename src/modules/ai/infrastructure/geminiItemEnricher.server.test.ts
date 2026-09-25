/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import {
  geminiItemEnrichmentOutputMethod,
  geminiItemEnrichmentSchema
} from './geminiItemEnricher.server'

it('uses only Gemini-supported structured-output schema keywords', () => {
  const serialized = JSON.stringify(geminiItemEnrichmentSchema)
  expect(serialized).not.toContain('"const"')
  expect(serialized).not.toContain('"$ref"')
  expect(serialized).not.toContain('"minItems"')
  expect(serialized).not.toContain('"maxItems"')
})

it('uses Gemini native JSON schema output instead of tool calls', () => {
  expect(geminiItemEnrichmentOutputMethod).toBe('jsonSchema')
})

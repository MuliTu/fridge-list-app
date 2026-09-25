/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { createItemEnrichmentPostHandler } from './itemEnrichment.server'

const requestBody = {
  language: 'he',
  categories: ['מוצרי חלב', 'אחר'],
  items: [{ id: '1', name: 'חללב' }]
}

const logger = { success: jest.fn(), warn: jest.fn(), error: jest.fn() }

describe('AI item enrichment server', () => {
  it('authenticates before parsing or model execution', async () => {
    const enricher = { enrich: jest.fn() }
    const handler = createItemEnrichmentPostHandler({
      environment: {},
      authenticate: jest.fn().mockResolvedValue({ ok: false, reason: 'bad token' }),
      logger,
      enricher
    })

    const response = await handler({
      request: new Request('http://localhost/api/ai/enrich-items', { method: 'POST', body: 'not-json' })
    })

    expect(response.status).toBe(401)
    expect(enricher.enrich).not.toHaveBeenCalled()
  })

  it('grounds model categories against the supplied dataset', async () => {
    const enricher = {
      enrich: jest.fn().mockResolvedValue({
        items: [{
          id: '1', originalName: 'wrong', correctedName: 'חלב', category: 'מוצרי חלב ',
          categoryStatus: 'suggested', correctionReason: 'תיקון'
        }]
      })
    }
    const handler = createItemEnrichmentPostHandler({
      environment: {},
      authenticate: jest.fn().mockResolvedValue({ ok: true, uid: 'user-1' }),
      logger,
      enricher
    })

    const response = await handler({
      request: new Request('http://localhost/api/ai/enrich-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      result: {
        items: [{
          id: '1', originalName: 'חללב', correctedName: 'חלב', category: 'מוצרי חלב',
          categoryStatus: 'existing', correctionReason: 'תיקון'
        }]
      }
    })
  })

  it('fails closed without a configured Gemini key', async () => {
    const handler = createItemEnrichmentPostHandler({
      environment: {},
      authenticate: jest.fn().mockResolvedValue({ ok: true, uid: 'user-1' }),
      logger
    })
    const response = await handler({
      request: new Request('http://localhost/api/ai/enrich-items', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      })
    })
    expect(response.status).toBe(503)
  })
})

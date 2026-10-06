/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import {
  N8nCategorizationProvider
} from './n8nCategorizationProvider.server'

describe('N8nCategorizationProvider', () => {
  it('preserves the webhook contract and normalizes compatible items', async () => {
    const fetchMock = jest.fn().mockResolvedValue(Response.json({
      items: [
        { item: 'חלב', category: 'מוצרי חלב', providerDetail: 'drop' },
        { malformed: true }
      ]
    }))

    await expect(new N8nCategorizationProvider('https://workflow.example.test/hook', fetchMock).categorize('חלב')).resolves.toEqual({
      items: [{ item: 'חלב', category: 'מוצרי חלב' }]
    })
    expect(fetchMock).toHaveBeenCalledWith('https://workflow.example.test/hook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'חלב' })
    })
  })

  it.each([
    jest.fn().mockRejectedValue(new Error('network secret')),
    jest.fn().mockResolvedValue(new Response('provider secret', { status: 500 })),
    jest.fn().mockResolvedValue(new Response('not-json')),
    jest.fn().mockResolvedValue(Response.json({ unexpected: true }))
  ])('maps provider failure without exposing its payload', async (fetchMock) => {
    await expect(new N8nCategorizationProvider('https://workflow.example.test/hook', fetchMock).categorize('milk')).rejects.toEqual(
      expect.objectContaining({ code: 'upstream_failed' })
    )
  })
})

it.each([undefined, '', 'http://workflow.example.test/hook', 'https://user:password@workflow.example.test/hook'])('rejects unavailable configuration without fetching (%s)', async (endpoint) => {
  const fetchMock = jest.fn()
  await expect(new N8nCategorizationProvider(endpoint, fetchMock).categorize('milk')).rejects.toEqual(expect.objectContaining({ code: 'unavailable' }))
  expect(fetchMock).not.toHaveBeenCalled()
})

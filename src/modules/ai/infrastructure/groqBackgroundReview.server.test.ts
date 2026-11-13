/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { GroqRateLimitError, reviewWithGroq } from './groqBackgroundReview.server'

const items = [
  { key: 'first-secret-id', item: 'Synthetic grocery 1', bought: false, list_name: 'private sublist' },
  { key: 'second-secret-id', item: 'Synthetic grocery 1', bought: false, list_name: 'private sublist' },
  { key: 'third-secret-id', item: 'Synthetic grocery 1', bought: true, list_name: 'private sublist' },
  { key: 'fourth-secret-id', item: 'Synthetic grocery 1', bought: false, list_name: 'another private sublist' }
]

const providerResponse = (result: object) => Response.json({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }]
})

it('minimizes the outbound payload and grounds results within purchase and sublist scope', async () => {
  const send = jest.fn(async (_url: string, _request: RequestInit) => providerResponse({
    mode: 'list_review',
    duplicates: [{ keepKey: '1', removeKeys: ['3', '4', '999'], reason: 'Provider suggestion' }],
    renames: [{ key: '2', currentName: 'Synthetic grocery 1', suggestedName: 'Other', reason: 'Provider suggestion' }]
  }))
  const signal = new AbortController().signal
  const result = await reviewWithGroq('test-key', items, 'en', signal, send as unknown as typeof fetch)
  const [url, request] = send.mock.calls[0]
  expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
  expect(request.signal).toBe(signal)
  const body = JSON.parse(String(request.body))
  expect(body.model).toBe('openai/gpt-oss-20b')
  expect(body.response_format.json_schema.strict).toBe(true)
  expect(JSON.parse(body.messages[1].content)).toEqual({
    language: 'en',
    items: [['1', items[0].item, 0, 0], ['2', items[1].item, 0, 0],
      ['3', items[2].item, 0, 1], ['4', items[3].item, 1, 0]]
  })
  expect(JSON.stringify(body)).not.toMatch(/secret-id|private sublist|test-key/)
  expect(result.duplicates).toEqual([{ keepKey: items[0].key, removeKeys: [items[1].key], reason: 'Same grocery name' }])
  expect(result.renames).toEqual([])
})

it('preserves provider backoff for the shared limiter without hidden retries', async () => {
  const send = jest.fn(async () => new Response(null, { status: 429, headers: { 'Retry-After': '64.1' } }))
  await expect(reviewWithGroq('test-key', items, 'en', new AbortController().signal, send as unknown as typeof fetch))
    .rejects.toEqual(new GroqRateLimitError(65))
  expect(send).toHaveBeenCalledTimes(1)
})

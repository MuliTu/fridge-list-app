/** @jest-environment node */
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })
import { configuredWebhook } from './configuredWebhook.server'
import { N8nReceiptScanner } from '../modules/receipts/infrastructure/n8nReceiptScanner.server'

it.each([undefined, '', 'not a URL', 'http://workflow.example.test', 'file:///tmp/data', 'https://user:password@workflow.example.test', 'https://workflow.example.test/#fragment'])('rejects invalid configuration without exposing its value', (value) => {
  expect(() => configuredWebhook(value)).toThrow('Optional webhook is not configured')
})
it('normalizes explicitly configured HTTPS endpoints', () => {
  expect(configuredWebhook(' https://workflow.example.test/hook ')).toBe('https://workflow.example.test/hook')
})
it('keeps receipt workflows independently disabled without configuration', async () => {
  const fetcher = jest.fn()
  const scanner = new N8nReceiptScanner(undefined, undefined, fetcher)
  await expect(scanner.scanFile({ image_base64: 'synthetic', mime_type: 'image/png' })).rejects.toMatchObject({ code: 'unavailable' })
  await expect(scanner.scanText({ text: 'synthetic' })).rejects.toMatchObject({ code: 'unavailable' })
  expect(fetcher).not.toHaveBeenCalled()
})

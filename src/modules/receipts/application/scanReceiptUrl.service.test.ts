import { ScanReceiptUrlService } from './scanReceiptUrl.service'
import type { ReceiptScanner } from './receiptScanner'

const context = { principal: { kind: 'user' as const, uid: 'u', email: 'u@example.com', emailVerified: true }, requestId: 'r', now: new Date() }

it('sends only text returned by the safe fetcher to the scanner', async () => {
  const fetcher = { fetchText: jest.fn().mockResolvedValue('validated receipt text') }
  const scanner: jest.Mocked<ReceiptScanner> = { scanFile: jest.fn(), scanText: jest.fn().mockResolvedValue({ body: { total: 1 }, status: 200 }) }
  await expect(new ScanReceiptUrlService(fetcher, scanner).execute(context, { url: 'https://example.com/r' }))
    .resolves.toEqual({ body: { total: 1 }, status: 200 })
  expect(scanner.scanText).toHaveBeenCalledWith({ text: 'validated receipt text' })
})

it('never invokes the scanner when URL policy rejects the target', async () => {
  const fetcher = { fetchText: jest.fn().mockRejectedValue({ code: 'invalid_input' }) }
  const scanner: jest.Mocked<ReceiptScanner> = { scanFile: jest.fn(), scanText: jest.fn() }
  await expect(new ScanReceiptUrlService(fetcher, scanner).execute(context, { url: 'https://localhost' }))
    .rejects.toMatchObject({ code: 'invalid_input' })
  expect(scanner.scanText).not.toHaveBeenCalled()
})

it.each([null, [], {}])('rejects malformed input %p before fetching', async (input) => {
  const fetcher = { fetchText: jest.fn() }
  const scanner: jest.Mocked<ReceiptScanner> = { scanFile: jest.fn(), scanText: jest.fn() }

  await expect(new ScanReceiptUrlService(fetcher, scanner).execute(context, input))
    .rejects.toMatchObject({ code: 'invalid_input' })
  expect(fetcher.fetchText).not.toHaveBeenCalled()
  expect(scanner.scanText).not.toHaveBeenCalled()
})

import { ApplicationError, type RequestContext } from '../../shared'
import type { ReceiptScanner, ReceiptScanResult } from './receiptScanner'

export interface ReceiptUrlFetcher {
  fetchText(url: string): Promise<string>
}

export class ScanReceiptUrlService {
  constructor(private readonly urlFetcher: ReceiptUrlFetcher, private readonly scanner: ReceiptScanner) {}

  async execute(context: RequestContext, input: unknown): Promise<ReceiptScanResult> {
    if (context.principal.kind !== 'user') {
      throw new ApplicationError('forbidden', 'Receipt scanning requires a user principal')
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new ApplicationError('invalid_input', 'Receipt URL input must be an object')
    }
    const url = (input as { url?: unknown }).url
    if (typeof url !== 'string' || !url.trim()) {
      throw new ApplicationError('invalid_input', 'Receipt URL is required')
    }
    const text = await this.urlFetcher.fetchText(url.trim())
    if (!text) throw new ApplicationError('invalid_input', 'Receipt URL returned no usable content')
    return this.scanner.scanText({ text })
  }
}

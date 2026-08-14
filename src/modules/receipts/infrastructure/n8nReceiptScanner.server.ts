import { ApplicationError } from '../../shared'
import type { ReceiptScanner, ReceiptScanResult } from '../application/receiptScanner'

export class N8nReceiptScanner implements ReceiptScanner {
  constructor(private readonly fileEndpoint: string, private readonly urlEndpoint: string, private readonly fetcher: typeof fetch = fetch) {}

  private async post(endpoint: string, body: unknown): Promise<ReceiptScanResult> {
    try {
      const response = await this.fetcher(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      return { body: await response.json(), status: response.status }
    } catch (error) {
      throw new ApplicationError('upstream_failed', 'Receipt scanner request failed', error)
    }
  }

  scanFile(input: { image_base64: string; mime_type: string }) { return this.post(this.fileEndpoint, input) }
  scanText(input: { text: string }) { return this.post(this.urlEndpoint, input) }
}

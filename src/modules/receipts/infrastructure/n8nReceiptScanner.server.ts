import { configuredWebhook } from '../../../lib/configuredWebhook.server'
import { ApplicationError } from '../../shared'
import type { ReceiptScanner, ReceiptScanResult } from '../application/receiptScanner'

export class N8nReceiptScanner implements ReceiptScanner {
  constructor(private readonly fileEndpoint: string | undefined, private readonly urlEndpoint: string | undefined, private readonly fetcher: typeof fetch = fetch) {}

  private async post(endpoint: string | undefined, body: unknown): Promise<ReceiptScanResult> {
    const destination = configuredWebhook(endpoint)
    try {
      const response = await this.fetcher(destination, {
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

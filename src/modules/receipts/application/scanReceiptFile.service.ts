import { ApplicationError, type RequestContext } from '../../shared'
import type { ReceiptScanner, ReceiptScanResult } from './receiptScanner'

export const MAX_RECEIPT_FILE_BYTES = 10 * 1024 * 1024
export const RECEIPT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

export type ScanReceiptFileInput = { image_base64?: unknown; mime_type?: unknown }

const validBase64 = (value: string): boolean =>
  value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value)

export class ScanReceiptFileService {
  constructor(private readonly scanner: ReceiptScanner) {}

  async execute(context: RequestContext, input: unknown): Promise<ReceiptScanResult> {
    if (context.principal.kind !== 'user') {
      throw new ApplicationError('forbidden', 'Receipt scanning requires a user principal')
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new ApplicationError('invalid_input', 'Receipt file input must be an object')
    }
    const body = input as ScanReceiptFileInput
    if (typeof body.mime_type !== 'string' || !RECEIPT_MIME_TYPES.has(body.mime_type)) {
      throw new ApplicationError('invalid_input', 'Unsupported receipt file type')
    }
    if (typeof body.image_base64 !== 'string' || !validBase64(body.image_base64)) {
      throw new ApplicationError('invalid_input', 'Receipt file must be valid base64')
    }
    const bytes = Buffer.byteLength(body.image_base64, 'base64')
    if (!bytes || bytes > MAX_RECEIPT_FILE_BYTES) {
      throw new ApplicationError('invalid_input', 'Receipt file is too large')
    }
    return this.scanner.scanFile({ image_base64: body.image_base64, mime_type: body.mime_type })
  }
}

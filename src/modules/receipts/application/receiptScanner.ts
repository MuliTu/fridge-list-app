export type ReceiptScanResult = { body: unknown; status: number }

export interface ReceiptScanner {
  scanFile(input: { image_base64: string; mime_type: string }): Promise<ReceiptScanResult>
  scanText(input: { text: string }): Promise<ReceiptScanResult>
}

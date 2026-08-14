export type ReceiptLineRecord = { name: string; price: number; quantity: number }
export type ReceiptRecord = {
  image_url: null
  image_ref: string | null
  source_url: string | null
  store_name: string | null
  items: ReceiptLineRecord[]
  total: number | null
  scanned_at: string
  scanned_by: string | null
}

export interface ReceiptRepository {
  nextId(listId: string): string
  save(listId: string, receiptId: string, receipt: ReceiptRecord): Promise<void>
  find(listId: string, receiptId: string): Promise<ReceiptRecord | null>
  delete(listId: string, receiptId: string): Promise<void>
}

export type ReceiptImageRecord = { data: string; contentType: string; uploaded_at: string }
export interface ImageRepository {
  save(imageId: string, image: ReceiptImageRecord): Promise<void>
  find(imageId: string): Promise<ReceiptImageRecord | null>
  delete(imageId: string): Promise<void>
}

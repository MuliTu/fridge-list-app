import { ApplicationError, type RequestContext } from '../../shared'
import type { ListAuthorizationRepository } from '../../groceries'
import type { ImageRepository, ReceiptImageRecord, ReceiptLineRecord, ReceiptRecord, ReceiptRepository } from './receiptPersistence'

export const MAX_RECEIPT_IMAGE_BYTES = 700_000

const key = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[.#$/[\]\u0000-\u001f\u007f]/.test(value)) {
    throw new ApplicationError('invalid_input', `${field} is invalid`)
  }
  return value.trim()
}
const optionalText = (value: unknown, field: string, max: number): string | null => {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new ApplicationError('invalid_input', `${field} is invalid`)
  return value.trim()
}
const sourceUrl = (value: unknown): string | null => {
  const text = optionalText(value, 'source_url', 2_000)
  if (!text) return null
  try { const url = new URL(text); return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null } catch { return null }
}
const amount = (value: unknown, field: string, nullable = false): number | null => {
  if (nullable && value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100_000_000) throw new ApplicationError('invalid_input', `${field} is invalid`)
  return value
}
const lines = (value: unknown): ReceiptLineRecord[] => {
  if (!Array.isArray(value) || value.length > 500) throw new ApplicationError('invalid_input', 'items are invalid')
  return value.map((line) => {
    if (!line || typeof line !== 'object') throw new ApplicationError('invalid_input', 'receipt item is invalid')
    const item = line as Record<string, unknown>
    return {
      name: optionalText(item.name, 'item.name', 200) ?? (() => { throw new ApplicationError('invalid_input', 'item.name is invalid') })(),
      price: amount(item.price, 'item.price')!,
      quantity: amount(item.quantity, 'item.quantity')!
    }
  })
}
const image = (value: unknown, now: Date): { record: ReceiptImageRecord | null; skipped: boolean } => {
  if (value == null) return { record: null, skipped: false }
  if (!value || typeof value !== 'object') throw new ApplicationError('invalid_input', 'image is invalid')
  const input = value as Record<string, unknown>
  if (typeof input.data !== 'string' || input.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)) throw new ApplicationError('invalid_input', 'image data is invalid')
  if (typeof input.contentType !== 'string' || !['image/jpeg','image/png','image/webp','application/pdf'].includes(input.contentType)) throw new ApplicationError('invalid_input', 'image type is invalid')
  if (!input.data) throw new ApplicationError('invalid_input', 'image data is invalid')
  if (Buffer.byteLength(input.data, 'base64') > MAX_RECEIPT_IMAGE_BYTES) return { record: null, skipped: true }
  return { record: { data: input.data, contentType: input.contentType, uploaded_at: now.toISOString() }, skipped: false }
}

export class ReceiptCommandService {
  constructor(private readonly receipts: ReceiptRepository, private readonly images: ImageRepository, private readonly authorization: ListAuthorizationRepository) {}

  private async authorized(context: RequestContext, listId: unknown) {
    const id = key(listId, 'listId')
    await this.authorization.assertAccessible(context.principal, id)
    return id
  }

  async save(context: RequestContext, listId: unknown, input: Record<string, unknown>): Promise<{ key: string; imageSkipped: boolean }> {
    const authorizedListId = await this.authorized(context, listId)
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new ApplicationError('invalid_input', 'Receipt is invalid')
    }
    const receiptId = this.receipts.nextId(authorizedListId)
    const validatedImage = image(input.image, context.now)
    const imageRecord = validatedImage.record
    const record: ReceiptRecord = {
      image_url: null, image_ref: imageRecord ? receiptId : null, source_url: sourceUrl(input.source_url),
      store_name: optionalText(input.store_name, 'store_name', 200), items: lines(input.items),
      total: amount(input.total, 'total', true), scanned_at: context.now.toISOString(),
      scanned_by: context.principal.kind === 'user' ? context.principal.email : context.principal.service
    }
    if (imageRecord) await this.images.save(receiptId, imageRecord)
    try { await this.receipts.save(authorizedListId, receiptId, record) } catch (error) {
      if (imageRecord) await this.images.delete(receiptId).catch(() => undefined)
      throw error
    }
    return { key: receiptId, imageSkipped: validatedImage.skipped }
  }

  async delete(context: RequestContext, listId: unknown, receiptId: unknown): Promise<void> {
    const authorizedListId = await this.authorized(context, listId)
    const id = key(receiptId, 'receiptId')
    const record = await this.receipts.find(authorizedListId, id)
    if (!record) throw new ApplicationError('not_found', 'Receipt not found')
    // Legacy receipt images are keyed by their owning receipt ID. Do not trust
    // a tampered cross-document image_ref as authority to delete another image.
    if (record.image_ref === id) await this.images.delete(id).catch(() => undefined)
    await this.receipts.delete(authorizedListId, id)
  }

  async getImage(context: RequestContext, listId: unknown, receiptId: unknown): Promise<{ dataUrl: string }> {
    const authorizedListId = await this.authorized(context, listId)
    const id = key(receiptId, 'receiptId')
    const receipt = await this.receipts.find(authorizedListId, id)
    if (receipt?.image_ref !== id) throw new ApplicationError('not_found', 'Receipt image not found')
    const stored = await this.images.find(id)
    if (!stored) throw new ApplicationError('not_found', 'Receipt image not found')
    return { dataUrl: `data:${stored.contentType};base64,${stored.data}` }
  }
}

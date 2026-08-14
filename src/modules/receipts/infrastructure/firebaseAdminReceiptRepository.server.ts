import { randomUUID } from 'node:crypto'
import type { Credential } from 'firebase-admin/app'
import { ApplicationError } from '../../shared'
import type { ReceiptRecord, ReceiptRepository } from '../application/receiptPersistence'

const safe = (value: string, field: string) => {
  if (!value || value.trim() !== value || value.length > 200 || /[.#$/[\]\u0000-\u001f\u007f]/.test(value)) {
    throw new ApplicationError('invalid_input', `${field} is invalid`)
  }
}

export class FirebaseAdminReceiptRepository implements ReceiptRepository {
  constructor(
    private readonly databaseUrl: string,
    private readonly credential: Pick<Credential, 'getAccessToken'>,
    private readonly fetcher: typeof fetch = fetch,
    private readonly createId: () => string = randomUUID
  ) {}
  nextId(listId: string): string { safe(listId, 'listId'); return this.createId() }
  private path(listId: string, receiptId: string) {
    safe(listId, 'listId'); safe(receiptId, 'receiptId')
    return `users/${listId}/receipts/${receiptId}`
  }
  private async request(listId: string, receiptId: string, method: 'GET' | 'PUT' | 'DELETE', body?: unknown) {
    const token = await this.credential.getAccessToken().catch((error) => {
      throw new ApplicationError('unavailable', 'Firebase Admin credential failed', error)
    })
    let response: Response
    try {
      response = await this.fetcher(`${this.databaseUrl}/${this.path(listId, receiptId)}.json`, {
        method,
        headers: { Authorization: `Bearer ${token.access_token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    } catch (error) { throw new ApplicationError('upstream_failed', 'Firebase receipt request failed', error) }
    if (!response.ok) throw new ApplicationError('upstream_failed', `Firebase receipt request returned HTTP ${response.status}`)
    return response
  }
  async save(listId: string, receiptId: string, receipt: ReceiptRecord) { await this.request(listId, receiptId, 'PUT', receipt) }
  async find(listId: string, receiptId: string) { return await (await this.request(listId, receiptId, 'GET')).json() as ReceiptRecord | null }
  async delete(listId: string, receiptId: string) { await this.request(listId, receiptId, 'DELETE') }
}

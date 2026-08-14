import { ApplicationError } from '../../shared'
import type { GroceryWriteRepository, NewGroceryRecord, ReactivateGroceryRecord } from './groceryWriteRepository'

const MAX_ITEM_LENGTH = 200
const MAX_CATEGORY_LENGTH = 100
const MAX_RAW_TEXT_LENGTH = 2_000
const MAX_ACTOR_LENGTH = 320

const requireTrimmedString = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== 'string') {
    throw new ApplicationError('invalid_input', `${field} must be a string`)
  }

  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) {
    throw new ApplicationError('invalid_input', `${field} must contain 1-${maxLength} characters`)
  }
  return trimmed
}

const optionalTrimmedString = (value: unknown, field: string, maxLength: number): string | null => {
  if (value == null) return null
  return requireTrimmedString(value, field, maxLength)
}

const requireIsoTimestamp = (value: unknown): string => {
  const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
  if (typeof value !== 'string' || !isoTimestamp.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ApplicationError('invalid_input', 'added_at must be a valid timestamp')
  }
  return value
}

export type PersistN8nGroceryCommand =
  | {
      action: 'insert'
      item: unknown
      category: unknown
      added_at: unknown
      raw_text?: unknown
      created_by?: unknown
      idempotency_key?: unknown
    }
  | {
      action: 'update'
      key: unknown
      added_at: unknown
    }

export type PersistN8nGroceryResult =
  | { action: 'insert'; key: string }
  | { action: 'update'; key: string }

export class PersistN8nGroceryService {
  constructor(private readonly repository: GroceryWriteRepository) {}

  async execute(allowedListId: string, command: PersistN8nGroceryCommand): Promise<PersistN8nGroceryResult> {
    if (command.action === 'insert') {
      const record: NewGroceryRecord = {
        item: requireTrimmedString(command.item, 'item', MAX_ITEM_LENGTH),
        category: requireTrimmedString(command.category, 'category', MAX_CATEGORY_LENGTH),
        added_at: requireIsoTimestamp(command.added_at),
        raw_text: optionalTrimmedString(command.raw_text, 'raw_text', MAX_RAW_TEXT_LENGTH),
        bought: false,
        created_by: optionalTrimmedString(command.created_by, 'created_by', MAX_ACTOR_LENGTH)
      }
      const key =
        typeof command.idempotency_key === 'string' && command.idempotency_key.trim()
          ? await this.repository.insertIdempotent(allowedListId, command.idempotency_key.trim(), record)
          : await this.repository.insert(allowedListId, record)
      return { action: 'insert', key }
    }

    const key = requireTrimmedString(command.key, 'key', 200)
    const record: ReactivateGroceryRecord = {
      bought: false,
      added_at: requireIsoTimestamp(command.added_at)
    }
    await this.repository.reactivate(allowedListId, key, record)
    return { action: 'update', key }
  }
}

import { OTHER_CATEGORY_NAME } from '../../lib/categories'
import {
  aiAssistantRequestSchema,
  type AiAssistantRequest
} from '../../modules/ai'
import type { Category, GroceryItem, ListChangeEvent, PurchaseEvent } from '../../types'

interface AiRetrievalContext {
  items: GroceryItem[]
  changes: ListChangeEvent[]
  purchases: PurchaseEvent[]
  categories: Category[]
}

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const nullableText = (value: unknown): string | null => text(value) || null

// Firebase contains records created by older app versions, before timestamps,
// quantity, unit, and category fields were consistently written. Convert that
// mixed historical data into the strict, bounded API contract instead of allowing
// one legacy record to reject the entire AI request.
export const buildAiAssistantRequest = (input: {
  mode: AiAssistantRequest['mode']
  language: AiAssistantRequest['language']
  householdName: string
  context: AiRetrievalContext
}): AiAssistantRequest => {
  const items = input.context.items
    .flatMap((item) => {
      const key = text(item.key)
      const name = text(item.item)
      if (!key || !name) return []
      return [{
        key,
        name,
        category: text(item.category) || OTHER_CATEGORY_NAME,
        bought: item.bought === true,
        listName: nullableText(item.list_name),
        addedAt: text(item.added_at),
        modifiedAt: nullableText(item.modified_at)
      }]
    })
    .slice(-300)

  const changes = input.context.changes
    .flatMap((change) => {
      const itemKey = text(change.itemKey)
      const itemName = text(change.itemName)
      if (!itemKey || !itemName || !['added', 'removed', 'renamed'].includes(change.type)) return []
      return [{
        type: change.type,
        itemKey,
        itemName,
        previousName: nullableText(change.previousName),
        listName: nullableText(change.listName),
        changedAt: text(change.changedAt)
      }]
    })
    .slice(-500)

  const purchases = input.context.purchases
    .flatMap((purchase) => {
      const itemName = text(purchase.itemName)
      if (!itemName) return []
      const quantity = typeof purchase.quantity === 'number' && Number.isFinite(purchase.quantity) && purchase.quantity >= 0
        ? purchase.quantity
        : null
      return [{
        itemName,
        category: text(purchase.category) || OTHER_CATEGORY_NAME,
        quantity,
        unit: nullableText(purchase.unit),
        purchasedAt: text(purchase.purchasedAt)
      }]
    })
    .slice(-1000)

  const categories = Array.from(new Set(
    input.context.categories.map((category) => text(category.name)).filter(Boolean)
  )).slice(0, 100)

  return aiAssistantRequestSchema.parse({
    mode: input.mode,
    language: input.language,
    householdName: text(input.householdName) || 'Home',
    items,
    changes,
    purchases,
    categories
  })
}

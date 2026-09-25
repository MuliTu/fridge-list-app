import { z } from 'zod'

const shortText = z.string().trim().min(1).max(200)
const itemKey = z.string().trim().min(1).max(200)

export const aiListItemSchema = z.object({
  key: itemKey,
  name: shortText,
  category: z.string().trim().min(1).max(100),
  bought: z.boolean(),
  listName: z.string().trim().max(100).nullable(),
  addedAt: z.string().max(50),
  modifiedAt: z.string().max(50).nullable()
})

export const aiListChangeSchema = z.object({
  type: z.enum(['added', 'removed', 'renamed']),
  itemKey,
  itemName: shortText,
  previousName: z.string().trim().max(200).nullable(),
  listName: z.string().trim().max(100).nullable(),
  changedAt: z.string().max(50)
})

export const aiPurchaseSchema = z.object({
  itemName: shortText,
  category: z.string().trim().max(100),
  quantity: z.number().finite().nonnegative().nullable(),
  unit: z.string().trim().max(40).nullable(),
  purchasedAt: z.string().max(50)
})

export const aiAssistantRequestSchema = z.object({
  mode: z.enum(['insights', 'list_review']),
  language: z.enum(['he', 'en']),
  householdName: z.string().trim().min(1).max(100),
  items: z.array(aiListItemSchema).max(300),
  changes: z.array(aiListChangeSchema).max(500),
  purchases: z.array(aiPurchaseSchema).max(1000),
  categories: z.array(z.string().trim().min(1).max(100)).max(100)
})

export const aiInsightsResultSchema = z.object({
  mode: z.literal('insights'),
  summary: z.array(z.string().trim().min(1).max(300)).max(5),
  nextSteps: z.array(z.string().trim().min(1).max(300)).max(5),
  proposedList: z
    .object({
      name: z.string().trim().min(1).max(100),
      items: z
        .array(
          z.object({
            name: shortText,
            category: z.string().trim().min(1).max(100),
            reason: z.string().trim().min(1).max(300)
          })
        )
        .max(20)
    })
    .nullable()
})

export const aiListReviewResultSchema = z.object({
  mode: z.literal('list_review'),
  duplicates: z
    .array(
      z.object({
        keepKey: itemKey,
        removeKeys: z.array(itemKey).min(1).max(10),
        reason: z.string().trim().min(1).max(300)
      })
    )
    .max(30),
  renames: z
    .array(
      z.object({
        key: itemKey,
        currentName: shortText,
        suggestedName: shortText,
        reason: z.string().trim().min(1).max(300)
      })
    )
    .max(50)
})

export const aiAssistantResultSchema = z.discriminatedUnion('mode', [
  aiInsightsResultSchema,
  aiListReviewResultSchema
])

export type AiAssistantRequest = z.infer<typeof aiAssistantRequestSchema>
export type AiListItem = z.infer<typeof aiListItemSchema>
export type AiListChange = z.infer<typeof aiListChangeSchema>
export type AiPurchase = z.infer<typeof aiPurchaseSchema>
export type AiInsightsResult = z.infer<typeof aiInsightsResultSchema>
export type AiListReviewResult = z.infer<typeof aiListReviewResultSchema>
export type AiAssistantResult = z.infer<typeof aiAssistantResultSchema>

export const aiItemEnrichmentRequestSchema = z.object({
  language: z.enum(['he', 'en']),
  categories: z.array(z.string().trim().min(1).max(100)).min(1).max(100),
  items: z
    .array(
      z.object({
        id: itemKey,
        name: shortText
      })
    )
    .min(1)
    .max(100)
})

export const aiEnrichedItemSchema = z.object({
  id: itemKey,
  originalName: shortText,
  correctedName: shortText,
  category: z.string().trim().min(1).max(100),
  categoryStatus: z.enum(['existing', 'suggested']),
  correctionReason: z.string().trim().max(300).nullable()
})

export const aiItemEnrichmentResultSchema = z.object({
  items: z.array(aiEnrichedItemSchema).max(100)
})

export type AiItemEnrichmentRequest = z.infer<typeof aiItemEnrichmentRequestSchema>
export type AiEnrichedItem = z.infer<typeof aiEnrichedItemSchema>
export type AiItemEnrichmentResult = z.infer<typeof aiItemEnrichmentResultSchema>

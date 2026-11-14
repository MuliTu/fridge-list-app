import { z } from 'zod'
import { guardianChangesSchema, type ProductIntegrityGuardianDecision } from './productIntegrityGuardian'

const guardianContextSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('add'),
    listName: z.string().min(1).max(100).nullable(),
    language: z.enum(['en', 'he']),
    details: guardianChangesSchema.omit({ name: true }).optional()
  }).strict(),
  z.object({
    operation: z.literal('update'),
    listName: z.string().min(1).max(100).nullable(),
    language: z.enum(['en', 'he']),
    itemId: z.string().min(1).max(200),
    details: guardianChangesSchema.omit({ name: true }).optional()
  }).strict()
])

export type GuardianContext = z.infer<typeof guardianContextSchema>

export const semanticGroceryMatchInputSchema = z.object({
  query: z.string().trim().min(1).max(120),
  correctedName: z.string().trim().min(1).max(120).optional(),
  guardian: guardianContextSchema.optional(),
  expectedSnapshotId: z.string().regex(/^[a-f0-9]{64}$/).optional()
}).strict().superRefine((input, context) => {
  if (input.correctedName && !input.expectedSnapshotId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expectedSnapshotId'],
      message: 'expectedSnapshotId is required when correctedName is provided'
    })
  }
})

export const semanticGrocerySelectionSchema = z.object({
  itemId: z.string().min(1).max(200),
  matchType: z.enum(['exact', 'similar', 'related'])
}).strict()

export const semanticGroceryProviderOutputSchema = z.object({
  distinct: z.boolean(),
  selections: z.array(semanticGrocerySelectionSchema).max(8)
}).strict()

export type SemanticGroceryMatchInput = z.infer<typeof semanticGroceryMatchInputSchema>
export type SemanticGroceryProviderOutput = z.infer<typeof semanticGroceryProviderOutputSchema>
export type SemanticGroceryMatchType = 'exact' | 'similar' | 'related' | 'distinct'

export type SemanticGroceryCandidate = {
  id: string
  name: string
  category: string
  bought: boolean
  hidden: boolean
  collapsed: boolean
  quantity?: number
  unit?: string
  notes?: string
}

export type SemanticGroceryMatch = SemanticGroceryCandidate & {
  matchType: Exclude<SemanticGroceryMatchType, 'distinct'>
}

export type SemanticGroceryMatchResult = {
  status: 'ok' | 'provider_unavailable' | 'stale_request' | 'candidate_limit_exceeded'
  evaluatedName: string
  snapshotId: string
  classification: SemanticGroceryMatchType
  matches: SemanticGroceryMatch[]
  candidateCount: number
  candidatesComplete?: boolean
  decision?: ProductIntegrityGuardianDecision
}

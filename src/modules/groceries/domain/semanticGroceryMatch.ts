import { z } from 'zod'

export const semanticGroceryMatchInputSchema = z.object({
  query: z.string().trim().min(1).max(120),
  correctedName: z.string().trim().min(1).max(120).optional(),
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
}

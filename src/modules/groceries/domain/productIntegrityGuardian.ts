import { z } from 'zod'

const nonBlankText = (max: number) => z.string().min(1).max(max).regex(/\S/)
const name = nonBlankText(200)
const category = nonBlankText(100)
const quantity = z.number().finite().nonnegative()
const unit = nonBlankText(40)
const notes = z.string().max(2_000)

export const guardianChangesSchema = z.object({
  name: name.optional(),
  category: category.optional(),
  quantity: quantity.nullable().optional(),
  unit: unit.nullable().optional(),
  notes: notes.nullable().optional()
}).strict()

export const productIntegrityGuardianDecisionSchema = z.object({
  action: z.enum(['create', 'use_existing', 'propose_update', 'needs_clarification']),
  normalizedItem: z.object({
    name,
    category: category.nullable(),
    quantity: quantity.nullable(),
    unit: unit.nullable(),
    brand: category.nullable(),
    variant: name.nullable(),
    notes: notes.nullable(),
    intendedRecipient: category.nullable()
  }).strict(),
  match: z.object({
    existingItemId: nonBlankText(200).nullable(),
    matchType: z.enum([
      'exact_duplicate', 'normalized_duplicate', 'probable_duplicate', 'related_variant',
      'distinct_product', 'uncertain', 'none'
    ]),
    confidence: z.number().min(0).max(1)
  }).strict(),
  issues: z.array(z.object({
    code: nonBlankText(100),
    description: nonBlankText(400),
    severity: z.enum(['low', 'medium', 'high'])
  }).strict()).max(12),
  clarification: z.object({
    required: z.boolean(),
    question: nonBlankText(250).nullable()
  }).strict(),
  proposedChanges: guardianChangesSchema.nullable(),
  reason: nonBlankText(500)
}).strict()

export type GuardianChanges = z.infer<typeof guardianChangesSchema>
export type ProductIntegrityGuardianDecision = z.infer<typeof productIntegrityGuardianDecisionSchema>

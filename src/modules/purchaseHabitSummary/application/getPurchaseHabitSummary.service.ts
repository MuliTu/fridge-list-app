import type { PurchaseHabitSummaryProvider } from './purchaseHabitSummaryProvider'

export type PurchaseHabitSummaryResult = {
  body: unknown
  status: number
}

export class GetPurchaseHabitSummaryService {
  constructor(private readonly provider: PurchaseHabitSummaryProvider) {}

  async execute(input: unknown): Promise<PurchaseHabitSummaryResult> {
    const changes = this.extractChanges(input)
    if (changes.length === 0) {
      return { body: { summary: [] }, status: 200 }
    }

    return await this.provider.summarize(changes)
  }

  private extractChanges(input: unknown): unknown[] {
    if (!input || typeof input !== 'object') return []
    const changes = (input as { changes?: unknown }).changes
    return Array.isArray(changes) ? changes : []
  }
}

import '@tanstack/react-start/server-only'

import { ApplicationError } from '../../shared'
import type {
  PurchaseHabitSummaryProvider,
  PurchaseHabitSummaryProviderResponse
} from '../application/purchaseHabitSummaryProvider'

type Fetch = typeof fetch

export class N8nPurchaseHabitSummaryProvider implements PurchaseHabitSummaryProvider {
  constructor(private readonly webhookUrl: string, private readonly fetchImpl: Fetch = fetch) {}

  async summarize(changes: unknown[]): Promise<PurchaseHabitSummaryProviderResponse> {
    try {
      const upstream = await this.fetchImpl(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes })
      })

      return {
        body: await upstream.json(),
        status: upstream.status
      }
    } catch (error) {
      throw new ApplicationError(
        'upstream_failed',
        'Purchase habit summary upstream failed',
        error
      )
    }
  }
}

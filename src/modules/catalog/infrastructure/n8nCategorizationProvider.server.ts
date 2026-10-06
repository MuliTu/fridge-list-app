import '@tanstack/react-start/server-only'
import { configuredWebhook } from '../../../lib/configuredWebhook.server'

import { ApplicationError } from '../../shared'
import type {
  CategorizationProvider,
  CategorizationResult,
  CategorizedItem
} from '../application/categorizationProvider'

type Fetch = typeof fetch

const normalizeItem = (value: unknown): CategorizedItem | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  return typeof candidate.item === 'string' && typeof candidate.category === 'string'
    ? { item: candidate.item, category: candidate.category }
    : null
}

export class N8nCategorizationProvider implements CategorizationProvider {
  constructor(private readonly endpoint?: string, private readonly fetchImpl: Fetch = fetch) {}

  async categorize(text: string): Promise<CategorizationResult> {
    const endpoint = configuredWebhook(this.endpoint)
    let response: Response
    try {
      response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
    } catch (error) {
      throw new ApplicationError('upstream_failed', 'Categorization provider request failed', error)
    }
    if (!response.ok) {
      throw new ApplicationError('upstream_failed', `Categorization provider returned HTTP ${response.status}`)
    }

    let data: unknown
    try {
      data = await response.json()
    } catch (error) {
      throw new ApplicationError('upstream_failed', 'Categorization provider response was invalid', error)
    }
    if (!data || typeof data !== 'object' || !Array.isArray((data as Record<string, unknown>).items)) {
      throw new ApplicationError('upstream_failed', 'Categorization provider response had no items')
    }

    return {
      items: ((data as Record<string, unknown>).items as unknown[])
        .map(normalizeItem)
        .filter((item): item is CategorizedItem => item !== null)
    }
  }
}

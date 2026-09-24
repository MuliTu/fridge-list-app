jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { N8nPurchaseHabitSummaryProvider } from '../../../../src/modules/purchaseHabitSummary/infrastructure/n8nPurchaseHabitSummaryProvider.server'

const sampleChange = {
  itemName: 'Coffee',
  direction: 'increase',
  window: 'weekly',
  recentCount: 6,
  priorCount: 1
}

describe('N8nPurchaseHabitSummaryProvider', () => {
  it('posts changes and returns the upstream body and status', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      status: 202,
      json: async () => ({ summary: ['Coffee is up.'] })
    })
    const provider = new N8nPurchaseHabitSummaryProvider(
      'https://n8n.example.test/webhook/purchase-habit-summary',
      fetchMock as typeof fetch
    )

    await expect(provider.summarize([sampleChange])).resolves.toEqual({
      body: { summary: ['Coffee is up.'] },
      status: 202
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://n8n.example.test/webhook/purchase-habit-summary',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: [sampleChange] })
      }
    )
  })

  it('maps fetch failures to an application error without exposing provider details', async () => {
    const provider = new N8nPurchaseHabitSummaryProvider(
      'https://n8n.example.test/webhook/purchase-habit-summary',
      jest.fn().mockRejectedValue(new Error('provider secret')) as typeof fetch
    )

    await expect(provider.summarize([sampleChange])).rejects.toEqual(
      expect.objectContaining({
        code: 'upstream_failed'
      })
    )
  })
})

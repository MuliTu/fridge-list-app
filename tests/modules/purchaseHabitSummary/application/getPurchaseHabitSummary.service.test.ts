import { GetPurchaseHabitSummaryService } from '../../../../src/modules/purchaseHabitSummary/application/getPurchaseHabitSummary.service'
import type { PurchaseHabitSummaryProvider } from '../../../../src/modules/purchaseHabitSummary/application/purchaseHabitSummaryProvider'

const sampleChange = {
  itemName: 'Coffee',
  direction: 'increase',
  window: 'weekly',
  recentCount: 6,
  priorCount: 1
}

describe('GetPurchaseHabitSummaryService', () => {
  it('returns an empty summary without calling the provider when changes are empty', async () => {
    const provider: PurchaseHabitSummaryProvider = {
      summarize: jest.fn()
    }
    const service = new GetPurchaseHabitSummaryService(provider)

    await expect(service.execute({ changes: [] })).resolves.toEqual({
      body: { summary: [] },
      status: 200
    })
    expect(provider.summarize).not.toHaveBeenCalled()
  })

  it('treats malformed input as empty changes', async () => {
    const provider: PurchaseHabitSummaryProvider = {
      summarize: jest.fn()
    }
    const service = new GetPurchaseHabitSummaryService(provider)

    await expect(service.execute({})).resolves.toEqual({
      body: { summary: [] },
      status: 200
    })
    expect(provider.summarize).not.toHaveBeenCalled()
  })

  it('forwards non-empty changes to the provider', async () => {
    const provider: PurchaseHabitSummaryProvider = {
      summarize: jest.fn(async () => ({
        body: { summary: ['Coffee is up.'] },
        status: 200
      }))
    }
    const service = new GetPurchaseHabitSummaryService(provider)

    await expect(service.execute({ changes: [sampleChange] })).resolves.toEqual({
      body: { summary: ['Coffee is up.'] },
      status: 200
    })
    expect(provider.summarize).toHaveBeenCalledWith([sampleChange])
  })
})

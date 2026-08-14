import { renderHook, waitFor } from '@testing-library/react'
import { usePurchaseHabitSummary } from './usePurchaseHabitSummary'
import { getPurchaseHabitSummary } from '../lib/firebase'
import type { HabitChange } from '../lib/purchaseHabitChanges'

jest.mock('../lib/firebase', () => ({
  getPurchaseHabitSummary: jest.fn()
}))

const change = (overrides: Partial<HabitChange> = {}): HabitChange => ({
  itemName: 'קפה',
  direction: 'increase',
  window: 'weekly',
  recentCount: 6,
  priorCount: 1,
  ...overrides
})

describe('usePurchaseHabitSummary', () => {
  beforeEach(() => {
    ;(getPurchaseHabitSummary as jest.Mock).mockReset()
  })

  it('never calls the API and returns no summary when there are no changes', () => {
    const { result } = renderHook(() => usePurchaseHabitSummary([]))

    expect(getPurchaseHabitSummary).not.toHaveBeenCalled()
    expect(result.current).toEqual({ summary: null, loading: false, error: false })
  })

  it('shows a loading state while the request is in flight, then the resolved summary', async () => {
    ;(getPurchaseHabitSummary as jest.Mock).mockReturnValue(new Promise(() => {}))
    // A stable array reference across re-renders, same as what usePurchaseInsights'
    // real (useState-backed) habitChanges value would be within a single render cycle
    // — inlining `[change()]` directly in the renderHook callback would instead
    // create a brand-new array on every internal re-render this hook's own setState
    // triggers, which (before this hook's fix) was a real infinite-render-loop bug for
    // the empty-array case, and would otherwise mask a real one here too (a stale
    // effect cleanup flipping `cancelled` before the in-flight promise resolves).
    const changes = [change()]
    const { result } = renderHook(() => usePurchaseHabitSummary(changes))

    expect(result.current.loading).toBe(true)
    expect(result.current.summary).toBeNull()
  })

  it('returns the resolved summary once the call succeeds', async () => {
    ;(getPurchaseHabitSummary as jest.Mock).mockResolvedValue(['You’ve been buying a lot more coffee lately.'])
    const changes = [change()]
    const { result } = renderHook(() => usePurchaseHabitSummary(changes))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.summary).toEqual(['You’ve been buying a lot more coffee lately.'])
    expect(result.current.error).toBe(false)
  })

  it('surfaces a graceful error state when the call fails, without throwing', async () => {
    ;(getPurchaseHabitSummary as jest.Mock).mockRejectedValue(new Error('network error'))
    const changes = [change()]
    const { result } = renderHook(() => usePurchaseHabitSummary(changes))

    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.summary).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('does NOT re-fetch when given a new array reference with the same underlying changes (avoids burning the shared Gemini quota on every Firebase snapshot)', async () => {
    ;(getPurchaseHabitSummary as jest.Mock).mockResolvedValue(['summary'])
    const { result, rerender } = renderHook(({ changes }) => usePurchaseHabitSummary(changes), {
      initialProps: { changes: [change()] }
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(getPurchaseHabitSummary).toHaveBeenCalledTimes(1)

    // A new array reference, same content — this is exactly what usePurchaseInsights
    // produces on every unrelated /purchaseHistory snapshot.
    rerender({ changes: [change()] })

    expect(getPurchaseHabitSummary).toHaveBeenCalledTimes(1)
  })

  it('DOES re-fetch when the underlying changes actually differ', async () => {
    ;(getPurchaseHabitSummary as jest.Mock).mockResolvedValue(['summary'])
    const { result, rerender } = renderHook(({ changes }) => usePurchaseHabitSummary(changes), {
      initialProps: { changes: [change()] }
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(getPurchaseHabitSummary).toHaveBeenCalledTimes(1)

    rerender({ changes: [change({ itemName: 'חלב' })] })

    await waitFor(() => expect(getPurchaseHabitSummary).toHaveBeenCalledTimes(2))
  })
})

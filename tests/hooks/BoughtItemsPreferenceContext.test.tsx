import { act, renderHook, waitFor } from '@testing-library/react'
import {
  BoughtItemsPreferenceProvider,
  useBoughtItemsPreference
} from '../../src/hooks/BoughtItemsPreferenceContext'
import {
  getKeepBoughtItemsInCategories,
  setKeepBoughtItemsInCategories
} from '../../src/lib/firebase'

jest.mock('../../src/lib/firebase', () => ({
  getKeepBoughtItemsInCategories: jest.fn(),
  setKeepBoughtItemsInCategories: jest.fn()
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BoughtItemsPreferenceProvider email="owner@example.com">
    {children}
  </BoughtItemsPreferenceProvider>
)

describe('BoughtItemsPreferenceProvider', () => {
  beforeEach(() => {
    ;(getKeepBoughtItemsInCategories as jest.Mock).mockReset().mockResolvedValue(false)
    ;(setKeepBoughtItemsInCategories as jest.Mock).mockReset().mockResolvedValue(undefined)
  })

  it('loads the persisted cross-device preference', async () => {
    ;(getKeepBoughtItemsInCategories as jest.Mock).mockResolvedValue(true)
    const { result } = renderHook(useBoughtItemsPreference, { wrapper })

    await waitFor(() => expect(result.current.isResolved).toBe(true))

    expect(result.current.keepBoughtItemsInCategories).toBe(true)
    expect(getKeepBoughtItemsInCategories).toHaveBeenCalledWith('owner@example.com')
  })

  it('persists the selected placement and updates immediately', async () => {
    const { result } = renderHook(useBoughtItemsPreference, { wrapper })
    await waitFor(() => expect(result.current.isResolved).toBe(true))

    await act(() => result.current.toggleBoughtItemsPlacement())

    expect(result.current.keepBoughtItemsInCategories).toBe(true)
    expect(setKeepBoughtItemsInCategories).toHaveBeenCalledWith('owner@example.com', true)
  })

  it('rolls back the optimistic choice when persistence fails', async () => {
    ;(setKeepBoughtItemsInCategories as jest.Mock).mockRejectedValue(new Error('permission denied'))
    const { result } = renderHook(useBoughtItemsPreference, { wrapper })
    await waitFor(() => expect(result.current.isResolved).toBe(true))

    await act(async () => {
      await expect(result.current.toggleBoughtItemsPlacement()).rejects.toThrow(
        'Failed to save bought-items placement preference'
      )
    })

    expect(result.current.keepBoughtItemsInCategories).toBe(false)
    expect(result.current.saveError).toBe(true)
  })
})

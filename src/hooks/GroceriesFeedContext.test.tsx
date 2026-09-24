import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { createDataCapabilitiesClient } from '../client/api/dataCapabilities'
import { createGroceryApiClient } from '../client/api/groceries'
import { GroceriesFeedProvider, useGroceriesFeed } from './GroceriesFeedContext'

jest.mock('../client/api/dataCapabilities', () => ({
  createDataCapabilitiesClient: jest.fn()
}))

jest.mock('../client/api/groceries', () => ({
  createGroceryApiClient: jest.fn()
}))

jest.mock('../lib/firebase', () => ({
  getCurrentUserIdToken: jest.fn(),
  onValue: jest.fn()
}))

jest.mock('./useIsPrerendering', () => ({
  useIsPrerendering: () => false
}))

jest.mock('./ListContext', () => {
  const activeListState = {
    activeList: { id: 'owner@example.test', name: 'Home', owner: 'owner@example.test', status: 'owner' },
    listApi: { groceriesRef: { path: 'users/owner/groceries' } }
  }
  return { useActiveList: () => activeListState }
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <GroceriesFeedProvider>{children}</GroceriesFeedProvider>
)

describe('GroceriesFeedProvider', () => {
  beforeEach(() => {
    jest.mocked(createDataCapabilitiesClient).mockReset()
    jest.mocked(createGroceryApiClient).mockReset()
  })

  it('uses the authenticated grocery API when RDS reads are enabled', async () => {
    const list = jest.fn().mockResolvedValue([
      {
        key: 'item-1',
        item: 'Milk',
        category: 'Dairy',
        bought: false,
        added_at: '2026-09-24T08:00:00.000Z'
      }
    ])
    jest.mocked(createDataCapabilitiesClient).mockReturnValue({
      get: jest.fn().mockResolvedValue({
        groceries: { reads: 'rds', writes: 'firebase' }
      })
    })
    jest.mocked(createGroceryApiClient).mockReturnValue({
      list
    } as unknown as ReturnType<typeof createGroceryApiClient>)

    const { result } = renderHook(() => useGroceriesFeed(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(list).toHaveBeenCalledWith('owner@example.test')
    expect(result.current.entries).toEqual([
      {
        key: 'item-1',
        item: 'Milk',
        category: 'Dairy',
        bought: false,
        added_at: '2026-09-24T08:00:00.000Z',
        isFresh: false
      }
    ])
  })
})

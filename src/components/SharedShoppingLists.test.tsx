import { act, render, screen } from '@testing-library/react'
import SharedShoppingList from './SharedShoppingLists'
import { discoverShoppingShares, getShoppingShare } from '../client/api/shoppingSharing'

jest.mock('../client/api/shoppingSharing', () => ({ discoverShoppingShares: jest.fn(), getShoppingShare: jest.fn(), shoppingSharingRequest: jest.fn() }))
jest.mock('../client/api/aiItemEnrichment', () => ({ enrichItemsWithAi: jest.fn() }))
jest.mock('../hooks/AuthContext', () => ({ useAuth: () => ({ user: { email: 'guest@example.com' } }) }))
jest.mock('../hooks/BehaviorSettingsContext', () => ({ useBehaviorSettings: () => ({ settings: { showCountdown: true, purchaseGesture: 'tap' } }) }))
jest.mock('@tanstack/react-router', () => ({ Link: ({ children }: any) => <a>{children}</a> }))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))

const snapshot = {
  id: 'share-a', name: 'A', isOwner: false,
  owner: { email: 'owner@example.com', displayName: 'Owner', photoURL: null }, members: [],
  items: [{ key: 'a', item: 'Shared milk', category: 'Dairy', bought: false, added_at: '2026-11-03' }]
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.mocked(discoverShoppingShares).mockResolvedValue([{ id: snapshot.id, name: snapshot.name, owner: snapshot.owner }])
  jest.mocked(getShoppingShare).mockReset().mockResolvedValue(snapshot)
})
afterEach(() => { jest.useRealTimers() })

it('renders only the authorized snapshot and never mounts household actions', async () => {
  render(<SharedShoppingList shareId="share-a" />)
  expect(await screen.findByText('Shared milk')).toBeInTheDocument()
  expect(getShoppingShare).toHaveBeenCalledWith('share-a', expect.any(AbortSignal))
  expect(screen.queryByText('Private medicine')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'sharing.shareList' })).not.toBeInTheDocument()
})

it('removes visible items on the first failed refresh after access is revoked', async () => {
  render(<SharedShoppingList shareId="share-a" />)
  await screen.findByText('Shared milk')
  jest.mocked(getShoppingShare).mockRejectedValue(new Error('403'))
  await act(async () => { jest.advanceTimersByTime(5000) })
  expect(screen.queryByText('Shared milk')).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('sharing.unavailable')
})

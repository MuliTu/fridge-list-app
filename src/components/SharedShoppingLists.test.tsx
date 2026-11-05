import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  categories: [
    { name: 'Custom shelf', color: '#123456', icon: '✨', order: 1 },
    { name: 'Dairy', color: '#f0c96b', icon: '🥛', order: 2 }
  ],
  items: [
    { key: 'a', item: 'Shared milk', category: 'Dairy', bought: false, added_at: '2026-11-03' },
    { key: 'custom', item: 'Special item', category: 'Custom shelf', bought: false, added_at: '2026-11-03' }
  ]
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

it('renders authorized custom categories in owner order and collapses them independently', async () => {
  render(<SharedShoppingList shareId="share-a" />)
  await screen.findByText('Special item')
  const headings = screen.getAllByRole('heading', { level: 2 })
  expect(headings.map(heading => heading.textContent)).toEqual(expect.arrayContaining([
    expect.stringContaining('Custom shelf'), expect.stringContaining('Dairy')
  ]))
  expect(headings.findIndex(heading => heading.textContent?.includes('Custom shelf')))
    .toBeLessThan(headings.findIndex(heading => heading.textContent?.includes('Dairy')))
  fireEvent.click(screen.getByRole('button', { name: /Custom shelf/ }))
  expect(screen.queryByText('Special item')).not.toBeInTheDocument()
  expect(screen.getByText('Shared milk')).toBeInTheDocument()
})

it('scopes the selected theme to the active authorized snapshot and clears it on failure', async () => {
  const { container } = render(<div className="workspace"><SharedShoppingList shareId="share-a" /></div>)
  await screen.findByText('Shared milk')
  const workspace = container.querySelector('.workspace')!
  expect(workspace).toHaveAttribute('data-shared-theme', 'blue')
  fireEvent.change(screen.getByLabelText('sharing.theme'), { target: { value: 'green' } })
  expect(workspace).toHaveAttribute('data-shared-theme', 'green')
  expect(localStorage.getItem('shared-list-theme:guest@example.com:share-a')).toBe('green')

  jest.mocked(getShoppingShare).mockRejectedValue(new Error('403'))
  await act(async () => { jest.advanceTimersByTime(5000) })
  await waitFor(() => expect(workspace).not.toHaveAttribute('data-shared-theme'))
})

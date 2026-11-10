import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SharedShoppingList from './SharedShoppingLists'
import { discoverShoppingShares, getShoppingShare, shoppingSharingRequest } from '../client/api/shoppingSharing'
import { enrichItemsWithAi } from '../client/api/aiItemEnrichment'

jest.mock('../client/api/shoppingSharing', () => ({ discoverShoppingShares: jest.fn(), getShoppingShare: jest.fn(), shoppingSharingRequest: jest.fn() }))
jest.mock('../client/api/aiItemEnrichment', () => ({ enrichItemsWithAi: jest.fn() }))
const mockAuth = { email: 'guest@example.com' as string | null }
jest.mock('../hooks/AuthContext', () => ({ useAuth: () => ({ user: mockAuth.email ? { email: mockAuth.email } : null }) }))
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
  localStorage.clear()
  mockAuth.email = 'guest@example.com'
  jest.mocked(discoverShoppingShares).mockResolvedValue([{ id: snapshot.id, name: snapshot.name, owner: snapshot.owner }])
  jest.mocked(getShoppingShare).mockReset().mockResolvedValue(snapshot)
  jest.mocked(shoppingSharingRequest).mockReset().mockResolvedValue({ status: 'ok' })
})
afterEach(() => { jest.useRealTimers() })

function pendingMutation() {
  let settle!: () => void
  const result = new Promise<unknown>(resolve => { settle = () => resolve({ status: 'ok' }) })
  return { result, settle }
}

function expectPrivateSnapshotCleared(container: HTMLElement) {
  expect(screen.queryByText('Shared milk')).not.toBeInTheDocument()
  expect(screen.queryByText(/A · Owner/)).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'A' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('shoppingList:unifiedAdd.label')).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(container.querySelector('.shared-list-categories')).toBeNull()
  expect(screen.queryByText('shoppingList:search.noResults')).not.toBeInTheDocument()
}

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

it('filters only the authorized shared snapshot and restores it when cleared', async () => {
  render(<SharedShoppingList shareId="share-a" />)
  await screen.findByText('Shared milk')

  const search = screen.getByLabelText('shoppingList:unifiedAdd.label')
  fireEvent.change(search, { target: { value: 'special' } })
  expect(screen.getByText('Special item')).toBeInTheDocument()
  expect(screen.queryByText('Shared milk')).not.toBeInTheDocument()
  expect(screen.queryByText('Private medicine')).not.toBeInTheDocument()

  fireEvent.click(screen.getByLabelText('shoppingList:search.clear'))
  expect(screen.getByText('Special item')).toBeInTheDocument()
  expect(screen.getByText('Shared milk')).toBeInTheDocument()

  fireEvent.change(search, { target: { value: '  SHARED MILK  ' } })
  expect(screen.getByText('Shared milk')).toBeInTheDocument()
  expect(screen.queryByText('Special item')).not.toBeInTheDocument()
  expect(getShoppingShare).toHaveBeenCalledTimes(1)
})

it('uses one field to filter while typing and adds only on explicit submit', async () => {
  render(<SharedShoppingList shareId="share-a" />)
  await screen.findByText('Shared milk')

  const input = screen.getByLabelText('shoppingList:unifiedAdd.label')
  expect(screen.getAllByRole('textbox')).toEqual([input])

  fireEvent.change(input, { target: { value: 'not in this list' } })

  expect(screen.getByText('shoppingList:search.noResults')).toHaveAttribute('role', 'status')
  expect(screen.queryByText('sharing.empty')).not.toBeInTheDocument()
  expect(shoppingSharingRequest).not.toHaveBeenCalled()
  expect(enrichItemsWithAi).not.toHaveBeenCalled()
  expect(getShoppingShare).toHaveBeenCalledTimes(1)

  fireEvent.submit(input.closest('form')!)

  await waitFor(() => expect(shoppingSharingRequest).toHaveBeenCalledWith({
    action: 'mutate',
    shareId: 'share-a',
    mutation: { operation: 'add', item: { name: 'not in this list' } }
  }))
  await waitFor(() => expect(input).toHaveValue(''))
  expect(enrichItemsWithAi).not.toHaveBeenCalled()
})

it('keeps the shared-list query available for retry when adding fails', async () => {
  jest.mocked(shoppingSharingRequest).mockRejectedValueOnce(new Error('offline'))
  render(<SharedShoppingList shareId="share-a" />)
  await screen.findByText('Shared milk')

  const input = screen.getByLabelText('shoppingList:unifiedAdd.label')
  fireEvent.change(input, { target: { value: 'Retry item' } })
  fireEvent.submit(input.closest('form')!)

  expect(await screen.findByText('shoppingList:quickAdd.failed')).toHaveAttribute('role', 'alert')
  expect(input).toHaveValue('Retry item')
})

it('clears private identity, items, editing, and search after an active mutation is denied', async () => {
  jest.mocked(shoppingSharingRequest).mockRejectedValueOnce(new Error('403'))
  const { container } = render(<SharedShoppingList shareId="share-a" />)
  await screen.findByText('Shared milk')
  await screen.findByText(/A · Owner/)
  fireEvent.change(screen.getByLabelText('shoppingList:unifiedAdd.label'), { target: { value: 'milk' } })
  fireEvent.click(screen.getByRole('button', { name: 'shoppingList:item.info' }))
  fireEvent.click(await screen.findByRole('button', { name: 'shoppingList:item.edit' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.submit(screen.getByLabelText('sharing.itemName').closest('form')!)

  await waitFor(() => expect(screen.getByText('sharing.unavailable')).toBeInTheDocument())
  expectPrivateSnapshotCleared(container)
})

it('clears private identity, items, and search when the post-mutation snapshot is denied', async () => {
  const { container } = render(<SharedShoppingList shareId="share-a" />)
  await screen.findByText('Shared milk')
  await screen.findByText(/A · Owner/)
  jest.mocked(getShoppingShare).mockRejectedValueOnce(new Error('403'))
  const input = screen.getByLabelText('shoppingList:unifiedAdd.label')
  fireEvent.change(input, { target: { value: 'New item' } })
  fireEvent.submit(input.closest('form')!)

  await waitFor(() => expect(screen.getByText('sharing.unavailable')).toBeInTheDocument())
  expectPrivateSnapshotCleared(container)
  expect(getShoppingShare).toHaveBeenCalledTimes(2)
})

it('keeps an empty authorized list distinct from a search with no matches', async () => {
  jest.mocked(getShoppingShare).mockResolvedValue({ ...snapshot, items: [] })
  render(<SharedShoppingList shareId="share-a" />)
  await screen.findByText('sharing.empty')
  expect(screen.queryByText('shoppingList:search.noResults')).not.toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('shoppingList:unifiedAdd.label'), {
    target: { value: 'milk' }
  })
  expect(screen.getByText('sharing.empty')).toBeInTheDocument()
  expect(screen.queryByText('shoppingList:search.noResults')).not.toBeInTheDocument()
})

it('keeps search, item edit, and theme actions scoped to the selected share', async () => {
  const { container } = render(<div className="workspace"><SharedShoppingList shareId="share-a" /></div>)
  await screen.findByText('Shared milk')
  fireEvent.change(screen.getByLabelText('shoppingList:unifiedAdd.label'), {
    target: { value: 'milk' }
  })
  expect(screen.queryByText('Special item')).not.toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('sharing.theme'), { target: { value: 'purple' } })
  expect(container.querySelector('.workspace')).toHaveAttribute('data-shared-theme', 'purple')

  fireEvent.click(screen.getByRole('button', { name: 'shoppingList:item.info' }))
  fireEvent.click(await screen.findByRole('button', { name: 'shoppingList:item.edit' }))
  fireEvent.change(screen.getByLabelText('sharing.itemName'), { target: { value: 'Shared oat milk' } })
  await act(async () => { fireEvent.submit(screen.getByLabelText('sharing.itemName').closest('form')!) })

  await waitFor(() => expect(shoppingSharingRequest).toHaveBeenCalledWith({
    action: 'mutate', shareId: 'share-a',
    mutation: { operation: 'update', itemId: 'a', item: { name: 'Shared oat milk', note: '' } }
  }))
  expect(getShoppingShare).toHaveBeenCalledWith('share-a', expect.any(AbortSignal))
  expect(enrichItemsWithAi).not.toHaveBeenCalled()
})

it('clears stale search state when the selected share changes', async () => {
  const { rerender } = render(<SharedShoppingList shareId="share-a" />)
  await screen.findByText('Shared milk')
  fireEvent.change(screen.getByLabelText('shoppingList:unifiedAdd.label'), {
    target: { value: 'special' }
  })

  rerender(<SharedShoppingList shareId="share-b" />)

  await waitFor(() => expect(getShoppingShare).toHaveBeenCalledWith('share-b', expect.any(AbortSignal)))
  expect(await screen.findByLabelText('shoppingList:unifiedAdd.label')).toHaveValue('')
})

it('does not restore the previous list after an in-flight add completes on another share', async () => {
  const pending = pendingMutation()
  const other = { ...snapshot, id: 'share-b', name: 'B', items: [{ ...snapshot.items[0], key: 'b', item: 'B only' }] }
  jest.mocked(getShoppingShare).mockImplementation(async id => id === 'share-b' ? other : snapshot)
  jest.mocked(shoppingSharingRequest).mockImplementationOnce(() => pending.result)

  const { rerender } = render(<SharedShoppingList shareId="share-a" />)
  await screen.findByText('Shared milk')
  const input = screen.getByLabelText('shoppingList:unifiedAdd.label')
  fireEvent.change(input, { target: { value: 'New A item' } })
  fireEvent.submit(input.closest('form')!)
  await waitFor(() => expect(shoppingSharingRequest).toHaveBeenCalledWith({
    action: 'mutate', shareId: 'share-a', mutation: { operation: 'add', item: { name: 'New A item' } }
  }))

  rerender(<SharedShoppingList shareId="share-b" />)
  expect(await screen.findByText('B only')).toBeInTheDocument()
  expect(screen.queryByText('Shared milk')).not.toBeInTheDocument()
  await act(async () => { pending.settle() })

  expect(screen.getByText('B only')).toBeInTheDocument()
  expect(screen.queryByText('Shared milk')).not.toBeInTheDocument()
  expect(getShoppingShare).toHaveBeenCalledTimes(2)
})

it('does not restore a revoked snapshot from an older in-flight add', async () => {
  const pending = pendingMutation()
  jest.mocked(shoppingSharingRequest).mockImplementationOnce(() => pending.result)
  render(<SharedShoppingList shareId="share-a" />)
  await screen.findByText('Shared milk')
  const input = screen.getByLabelText('shoppingList:unifiedAdd.label')
  fireEvent.change(input, { target: { value: 'New A item' } })
  fireEvent.submit(input.closest('form')!)
  await waitFor(() => expect(shoppingSharingRequest).toHaveBeenCalledTimes(1))

  jest.mocked(getShoppingShare).mockRejectedValueOnce(new Error('403'))
  await act(async () => { jest.advanceTimersByTime(5000) })
  expect(screen.getByRole('alert')).toHaveTextContent('sharing.unavailable')
  expect(screen.queryByText('Shared milk')).not.toBeInTheDocument()

  await act(async () => { pending.settle() })
  expect(screen.getByRole('alert')).toHaveTextContent('sharing.unavailable')
  expect(screen.queryByText('Shared milk')).not.toBeInTheDocument()
  expect(getShoppingShare).toHaveBeenCalledTimes(2)
})

it('ignores a refresh started before an active add is denied', async () => {
  let releaseRefresh!: () => void
  const delayedRefresh = new Promise<typeof snapshot>(resolve => {
    releaseRefresh = () => resolve(snapshot)
  })
  const { container } = render(<SharedShoppingList shareId="share-a" />)
  await screen.findByText('Shared milk')
  await screen.findByText(/A · Owner/)
  jest.mocked(getShoppingShare).mockImplementationOnce(() => delayedRefresh)
  await act(async () => { jest.advanceTimersByTime(5000) })
  expect(getShoppingShare).toHaveBeenCalledTimes(2)

  jest.mocked(shoppingSharingRequest).mockRejectedValueOnce(new Error('403'))
  const input = screen.getByLabelText('shoppingList:unifiedAdd.label')
  fireEvent.change(input, { target: { value: 'New item' } })
  fireEvent.submit(input.closest('form')!)
  await waitFor(() => expect(screen.getByText('sharing.unavailable')).toBeInTheDocument())
  expectPrivateSnapshotCleared(container)

  await act(async () => { releaseRefresh() })
  expect(screen.getByText('sharing.unavailable')).toBeInTheDocument()
  expectPrivateSnapshotCleared(container)
  expect(getShoppingShare).toHaveBeenCalledTimes(2)

  await act(async () => { jest.advanceTimersByTime(5000) })
  expect(await screen.findByText('Shared milk')).toBeInTheDocument()
  expect(screen.getByLabelText('shoppingList:unifiedAdd.label')).toHaveValue('')
  expect(getShoppingShare).toHaveBeenCalledTimes(3)
})

it('clears private content and ignores an in-flight add when the recipient signs out', async () => {
  const pending = pendingMutation()
  jest.mocked(shoppingSharingRequest).mockImplementationOnce(() => pending.result)
  const { rerender } = render(<SharedShoppingList shareId="share-a" />)
  await screen.findByText('Shared milk')
  const input = screen.getByLabelText('shoppingList:unifiedAdd.label')
  fireEvent.change(input, { target: { value: 'New A item' } })
  fireEvent.submit(input.closest('form')!)
  await waitFor(() => expect(shoppingSharingRequest).toHaveBeenCalledTimes(1))

  mockAuth.email = null
  rerender(<SharedShoppingList shareId="share-a" />)
  expect(screen.queryByText('Shared milk')).not.toBeInTheDocument()
  await act(async () => { pending.settle() })
  expect(screen.queryByText('Shared milk')).not.toBeInTheDocument()
  expect(getShoppingShare).toHaveBeenCalledTimes(1)
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
  expect(screen.queryByLabelText('shoppingList:unifiedAdd.label')).not.toBeInTheDocument()
})

it('keeps multiple participant avatars and theme controls in the responsive meta group', async () => {
  const members = Array.from({ length: 8 }, (_, index) => ({
    email: `member-${index}@example.com`,
    displayName: `Member ${index}`,
    photoURL: null
  }))
  jest.mocked(getShoppingShare).mockResolvedValue({ ...snapshot, members })

  const { container } = render(<SharedShoppingList shareId="share-a" />)
  await screen.findByText('Shared milk')

  const banner = container.querySelector('.shared-list-banner')
  const identity = banner?.querySelector('.shared-list-identity')
  const controls = banner?.querySelector('.shared-list-meta')
  const avatars = controls?.querySelector('.list-member-avatars')

  expect(identity).toContainElement(screen.getByRole('heading', { name: 'A' }))
  expect(controls).toBe(banner?.lastElementChild)
  expect(avatars?.children).toHaveLength(6)
  expect(avatars).toHaveTextContent('+4')
  expect(controls).toContainElement(screen.getByLabelText('sharing.theme'))
  expect(controls?.querySelector('.shared-theme-label')).toHaveTextContent('sharing.theme')
})

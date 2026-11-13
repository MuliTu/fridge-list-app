import { act, fireEvent, render, screen } from '@testing-library/react'
import { onValue } from '../lib/firebase'
import { GroceryFeedRecovery } from '../components/GroceryFeedRecovery'
import { useActiveList } from './ListContext'
import { GroceriesFeedProvider, useGroceriesFeed } from './GroceriesFeedContext'

jest.mock('../lib/firebase', () => ({ onValue: jest.fn() }))
jest.mock('./ListContext', () => ({ useActiveList: jest.fn() }))
jest.mock('./useIsPrerendering', () => ({ useIsPrerendering: () => false }))
jest.mock('react-i18next', () => {
  const t = (key: string, values?: { message?: string }) =>
    values?.message ? `${key}: ${values.message}` : key
  return { useTranslation: () => ({ t, i18n: { language: 'en' } }) }
})

type Subscription = {
  ref: { id: string }
  snapshot: (value: { val: () => Record<string, unknown> }) => void
  error: (error: Error) => void
  unsubscribe: jest.Mock
}

const onValueMock = onValue as jest.Mock
const useActiveListMock = useActiveList as jest.Mock
const subscriptions: Subscription[] = []

function FeedProbe() {
  const { entries, isLoading, status, toast } = useGroceriesFeed()
  return (
    <>
      <output data-testid="loading">{String(isLoading)}</output>
      <output data-testid="entry-count">{entries.length}</output>
      <output data-testid="entry-items">{entries.map((entry) => entry.item).join(', ')}</output>
      <output data-testid="feed-status">{status}</output>
      <output data-testid="feed-toast">{toast}</output>
    </>
  )
}

const listA = { groceriesRef: { id: 'list-a' } }
const listB = { groceriesRef: { id: 'list-b' } }
const apple = { item: 'Apple', category: 'produce', bought: false, added_at: '2026-01-01' }
const pear = { item: 'Pear', category: 'produce', bought: false, added_at: '2026-01-01' }

function emitSnapshot(subscription: Subscription, groceries: Record<string, unknown>) {
  act(() => subscription.snapshot({ val: () => groceries }))
}

describe('GroceriesFeedProvider subscription recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    subscriptions.length = 0
    useActiveListMock.mockReturnValue({ listApi: listA })
    onValueMock.mockImplementation((ref, snapshot, error) => {
      const unsubscribe = jest.fn()
      subscriptions.push({ ref, snapshot, error, unsubscribe })
      return unsubscribe
    })
  })

  it('ends loading and exposes the connection error before any snapshot', () => {
    render(<GroceriesFeedProvider><FeedProbe /><GroceryFeedRecovery /></GroceriesFeedProvider>)
    expect(subscriptions).toHaveLength(1)
    expect(screen.getByTestId('loading')).toHaveTextContent('true')

    act(() => subscriptions[0].error(new Error('permission denied')))

    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('entry-count')).toHaveTextContent('0')
    expect(screen.getByTestId('feed-status')).toHaveTextContent('workspace.feedError: permission denied')
    expect(screen.getByRole('alert')).toHaveTextContent('workspace.feedError: permission denied')
    expect(screen.getByRole('button', { name: 'workspace.feedRetry' })).toBeVisible()
  })

  it('retries only the current list and restores a successful snapshot', () => {
    render(<GroceriesFeedProvider><FeedProbe /><GroceryFeedRecovery /></GroceriesFeedProvider>)
    act(() => subscriptions[0].error(new Error('permission denied')))

    fireEvent.click(screen.getByRole('button', { name: 'workspace.feedRetry' }))

    expect(subscriptions).toHaveLength(2)
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1)
    expect(subscriptions[1].ref).toBe(listA.groceriesRef)
    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    emitSnapshot(subscriptions[0], { late: pear })
    expect(screen.getByTestId('entry-count')).toHaveTextContent('0')

    emitSnapshot(subscriptions[1], { first: apple })

    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('entry-items')).toHaveTextContent('Apple')
    expect(screen.getByTestId('feed-toast')).toBeEmptyDOMElement()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears the prior list, ignores late callbacks, and retries the current list', () => {
    const { rerender } = render(
      <GroceriesFeedProvider><FeedProbe /><GroceryFeedRecovery /></GroceriesFeedProvider>
    )
    emitSnapshot(subscriptions[0], { first: apple })
    expect(screen.getByTestId('entry-items')).toHaveTextContent('Apple')

    useActiveListMock.mockReturnValue({ listApi: listB })
    rerender(<GroceriesFeedProvider><FeedProbe /><GroceryFeedRecovery /></GroceriesFeedProvider>)

    expect(subscriptions).toHaveLength(2)
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1)
    expect(subscriptions[1].ref).toBe(listB.groceriesRef)
    expect(screen.getByTestId('entry-count')).toHaveTextContent('0')
    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    expect(screen.getByTestId('feed-status')).toHaveTextContent('workspace.feedConnecting')

    emitSnapshot(subscriptions[0], { late: pear })
    act(() => subscriptions[0].error(new Error('old list failed')))
    expect(screen.getByTestId('entry-count')).toHaveTextContent('0')
    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    emitSnapshot(subscriptions[1], { current: pear })
    expect(screen.getByTestId('entry-items')).toHaveTextContent('Pear')
    expect(screen.getByTestId('feed-toast')).toBeEmptyDOMElement()

    act(() => subscriptions[1].error(new Error('new list failed')))
    expect(screen.getByTestId('entry-count')).toHaveTextContent('0')
    expect(screen.getByRole('alert')).toHaveTextContent('new list failed')
    fireEvent.click(screen.getByRole('button', { name: 'workspace.feedRetry' }))
    expect(subscriptions).toHaveLength(3)
    expect(subscriptions[1].unsubscribe).toHaveBeenCalledTimes(1)
    expect(subscriptions[2].ref).toBe(listB.groceriesRef)
    emitSnapshot(subscriptions[2], { current: pear })
    expect(screen.getByTestId('entry-items')).toHaveTextContent('Pear')
  })

  it('preserves new-item toast behavior after the first snapshot and unsubscribes on unmount', () => {
    const { unmount } = render(
      <GroceriesFeedProvider><FeedProbe /></GroceriesFeedProvider>
    )
    emitSnapshot(subscriptions[0], { first: apple })
    expect(screen.getByTestId('feed-toast')).toBeEmptyDOMElement()

    emitSnapshot(subscriptions[0], { first: apple, second: pear })
    expect(screen.getByTestId('feed-toast')).toHaveTextContent('workspace.feedAdded')

    unmount()
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1)
  })
})

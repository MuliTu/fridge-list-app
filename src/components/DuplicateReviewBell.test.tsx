import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DuplicateReviewBell } from './DuplicateReviewBell'

jest.mock('../client/api/duplicateReview', () => {
  const list = jest.fn()
  const act = jest.fn().mockResolvedValue(undefined)
  return { __list: list, __act: act, createDuplicateReviewApiClient: () => ({ list, act }) }
})
jest.mock('../lib/firebase', () => ({ getCurrentUserIdToken: jest.fn(), sanitizeEmailKey: (value: string) => value.replace('.', '_') }))
jest.mock('../hooks/ListContext', () => ({ useActiveList: () => ({ myLists: [{ id: 'home@example.test', name: 'Home' }] }) }))
jest.mock('../hooks/DialogServiceContext', () => ({ useDialogService: () => ({ confirm: jest.fn().mockResolvedValue(true) }) }))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: any) => options?.name ? `${key}:${options.name}` : key, i18n: { language: 'en' } }) }))

const { __list: mockList, __act: mockAct } = jest.requireMock('../client/api/duplicateReview')

beforeEach(() => {
  mockAct.mockClear()
  mockList.mockResolvedValue({ unreadCount: 1, findings: [{
    id: 'pair-1', listId: 'home@example_test', listName: 'Home',
    items: [{ id: 'a', name: 'Milk' }, { id: 'b', name: 'milkk' }],
    reason: 'edit_distance', score: 0.8, createdAt: '2026-11-07T10:00:00.000Z', unread: true, status: 'open'
  }] })
})

it('shows a bounded unread badge, marks on open, and resolves keep-both immediately', async () => {
  const user = userEvent.setup()
  render(<DuplicateReviewBell />)
  expect(await screen.findByText('1')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'duplicateReview.open' }))
  expect(await screen.findByText('Milk · milkk')).toBeInTheDocument()
  expect(screen.getByText(/duplicateReview.status.read/)).toBeInTheDocument()
  await waitFor(() => expect(mockAct).toHaveBeenCalledWith('home@example_test', 'pair-1', { action: 'read' }))
  await user.click(screen.getByRole('button', { name: 'duplicateReview.keepBoth' }))
  await waitFor(() => expect(screen.queryByText('Milk · milkk')).not.toBeInTheDocument())
  expect(mockAct).toHaveBeenCalledWith('home@example_test', 'pair-1', { action: 'keep_both' })
})

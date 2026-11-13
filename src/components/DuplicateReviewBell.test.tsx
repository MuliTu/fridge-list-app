import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DuplicateReviewBell } from './DuplicateReviewBell'

jest.mock('../client/api/duplicateReview', () => {
  const list = jest.fn()
  const act = jest.fn().mockResolvedValue(undefined)
  return { __list: list, __act: act, createDuplicateReviewApiClient: () => ({ list, act }) }
})
jest.mock('../lib/firebase', () => ({ getCurrentUserIdToken: jest.fn(), sanitizeEmailKey: (value: string) => value.replace('.', '_') }))
let mockLists = [{ id: 'home@example.test', name: 'Home' }]
jest.mock('../hooks/ListContext', () => ({ useActiveList: () => ({ myLists: mockLists }) }))
const mockConfirm = jest.fn().mockResolvedValue(true)
jest.mock('../hooks/DialogServiceContext', () => ({ useDialogService: () => ({ confirm: mockConfirm }) }))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: any) => options?.name ? `${key}:${options.name}` : key, i18n: { language: 'en' } }) }))

const { __list: mockList, __act: mockAct } = jest.requireMock('../client/api/duplicateReview')

beforeEach(() => {
  mockLists = [{ id: 'home@example.test', name: 'Home' }]
  mockConfirm.mockReset().mockResolvedValue(true)
  mockAct.mockClear()
  mockList.mockReset()
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

it('refreshes findings when the page regains focus', async () => {
  mockList.mockResolvedValueOnce({ findings: [] })
  render(<DuplicateReviewBell />)
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1))
  act(() => { window.dispatchEvent(new Event('focus')) })
  expect(await screen.findByText('1')).toBeInTheDocument()
})

it('shows a closed-bell failure and allows a retry', async () => {
  mockList.mockRejectedValueOnce(new Error('offline'))
  const user = userEvent.setup()
  render(<DuplicateReviewBell />)
  expect(await screen.findByLabelText('duplicateReview.error')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /duplicateReview.open/ }))
  await user.click(screen.getByRole('button', { name: 'duplicateReview.retry' }))
  expect(await screen.findByText('Milk · milkk')).toBeInTheDocument()
})


it('removes findings when list access is lost', async () => {
  const { rerender } = render(<DuplicateReviewBell />)
  expect(await screen.findByText('1')).toBeInTheDocument()
  mockLists = []
  rerender(<DuplicateReviewBell />)
  await waitFor(() => expect(screen.queryByText('1')).not.toBeInTheDocument())
})

it('counts unread findings only and requires confirmation before deleting', async () => {
  const response = await mockList()
  mockList.mockResolvedValue({ findings: [{ ...response.findings[0], unread: false, status: 'read' }] })
  mockConfirm.mockResolvedValue(false)
  const user = userEvent.setup()
  render(<DuplicateReviewBell />)
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
  expect(screen.queryByText('1')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'duplicateReview.open' }))
  await user.click(await screen.findByRole('button', { name: 'duplicateReview.deleteOne:Milk' }))
  expect(mockConfirm).toHaveBeenCalled()
  expect(mockAct).not.toHaveBeenCalled()
})


it('loads each accessible list independently', async () => {
  mockLists = [{ id: 'home@example.test', name: 'Home' }, { id: 'work@example.test', name: 'Work' }]
  render(<DuplicateReviewBell />)
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
  expect(mockList.mock.calls.map((call: unknown[]) => call[0])).toEqual(['home@example_test', 'work@example_test'])
})
it('keeps the active-list load when an action for a removed list completes', async () => {
  const { findings } = await mockList()
  const work = { ...findings[0], listId: 'work@example_test', id: 'work-pair', listName: 'Work', items: [{ id: 'x', name: 'Rice' }, { id: 'y', name: 'Riice' }] }
  let finishAct!: () => void
  let finishList!: (response: unknown) => void
  mockAct.mockImplementationOnce(() => new Promise<void>((resolve) => { finishAct = resolve }))
  const user = userEvent.setup()
  const { rerender } = render(<DuplicateReviewBell />)
  await screen.findByText('1')
  await user.click(screen.getByRole('button', { name: 'duplicateReview.open' }))
  expect(mockAct).toHaveBeenCalledWith('home@example_test', 'pair-1', { action: 'read' })
  mockLists = [{ id: 'work@example.test', name: 'Work' }]
  mockList.mockImplementationOnce(() => new Promise((resolve) => { finishList = resolve }))
  rerender(<DuplicateReviewBell />)
  await waitFor(() => expect(mockList).toHaveBeenLastCalledWith('work@example_test', expect.anything()))
  await act(async () => { finishAct() })
  await act(async () => { finishList({ findings: [work] }) })
  expect(await screen.findByText('Rice · Riice')).toBeInTheDocument()
})

it('isolates findings with the same id in different lists', async () => {
  const { findings } = await mockList()
  const home = { ...findings[0], unread: false, status: 'read' }
  const work = { ...home, listId: 'work@example_test', listName: 'Work', items: [{ id: 'x', name: 'Rice' }, { id: 'y', name: 'Riice' }] }
  mockLists = [{ id: 'home@example.test', name: 'Home' }, { id: 'work@example.test', name: 'Work' }]
  mockList.mockImplementation((id: string) => Promise.resolve({ findings: [id === 'home@example_test' ? home : work] }))
  const user = userEvent.setup()
  render(<DuplicateReviewBell />)
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(3))
  await user.click(screen.getByRole('button', { name: 'duplicateReview.open' }))
  await user.click(screen.getAllByRole('button', { name: 'duplicateReview.keepBoth' })[0])
  await waitFor(() => expect(screen.queryByText('Milk · milkk')).not.toBeInTheDocument())
  expect(screen.getByText('Rice · Riice')).toBeInTheDocument()
})

it('ignores a confirmation after membership changes away and back', async () => {
  const { findings } = await mockList()
  mockList.mockResolvedValue({ findings: [{ ...findings[0], unread: false, status: 'read' }] })
  let finishConfirm!: (value: boolean) => void
  mockConfirm.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishConfirm = resolve }))
  const user = userEvent.setup()
  const { rerender } = render(<DuplicateReviewBell />)
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
  await user.click(screen.getByRole('button', { name: 'duplicateReview.open' }))
  await user.click(await screen.findByRole('button', { name: 'duplicateReview.deleteOne:Milk' }))
  mockLists = [{ id: 'work@example.test', name: 'Work' }]
  rerender(<DuplicateReviewBell />)
  mockLists = [{ id: 'home@example.test', name: 'Home' }]
  rerender(<DuplicateReviewBell />)
  await act(async () => { finishConfirm(true) })
  expect(mockAct).not.toHaveBeenCalled()
})

it('preserves a failed refresh and retry when cached unread findings are opened', async () => {
  const user = userEvent.setup()
  render(<DuplicateReviewBell />)
  await screen.findByText('1')
  mockList.mockRejectedValueOnce(new Error('offline'))
  act(() => { window.dispatchEvent(new Event('focus')) })
  await screen.findByLabelText('duplicateReview.error')
  await user.click(screen.getByRole('button', { name: /duplicateReview.open/ }))
  expect(await screen.findByRole('button', { name: 'duplicateReview.retry' })).toBeInTheDocument()
})

it('keeps retry in flight when an earlier mark-read finishes', async () => {
  const { findings } = await mockList()
  const additional = { ...findings[0], id: 'new-pair', items: [{ id: 'x', name: 'Rice' }, { id: 'y', name: 'Riice' }] }
  let finishAct!: () => void
  let finishRetry!: (value: unknown) => void
  mockAct.mockImplementationOnce(() => new Promise<void>((resolve) => { finishAct = resolve }))
  const user = userEvent.setup()
  render(<DuplicateReviewBell />)
  await screen.findByText('1')
  mockList.mockRejectedValueOnce(new Error('offline'))
  act(() => { window.dispatchEvent(new Event('focus')) })
  await screen.findByLabelText('duplicateReview.error')
  await user.click(screen.getByRole('button', { name: /duplicateReview.open/ }))
  expect(mockAct).toHaveBeenCalledWith('home@example_test', 'pair-1', { action: 'read' })
  mockList.mockImplementationOnce(() => new Promise((resolve) => { finishRetry = resolve }))
  await user.click(screen.getByRole('button', { name: 'duplicateReview.retry' }))
  expect(finishRetry).toEqual(expect.any(Function))
  await act(async () => { finishAct() })
  await act(async () => { finishRetry({ findings: [additional] }) })
  expect(await screen.findByText('Rice · Riice')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'duplicateReview.retry' })).not.toBeInTheDocument()
})

it.each(['read', 'keep_both'] as const)('reconciles a stale load after %s completes', async (action) => {
  const { findings } = await mockList()
  if (action === 'keep_both') mockList.mockResolvedValue({ findings: [{ ...findings[0], unread: false, status: 'read' }] })
  let finishLoad!: (value: unknown) => void
  let finishAction!: () => void
  mockAct.mockImplementationOnce(() => new Promise<void>((resolve) => { finishAction = resolve }))
  const user = userEvent.setup()
  render(<DuplicateReviewBell />)
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
  if (action === 'read') await screen.findByText('1')
  await user.click(screen.getByRole('button', { name: 'duplicateReview.open' }))
  if (action === 'keep_both') await user.click(await screen.findByRole('button', { name: 'duplicateReview.keepBoth' }))
  mockList.mockImplementationOnce(() => new Promise((resolve) => { finishLoad = resolve }))
  act(() => window.dispatchEvent(new Event('focus')))
  await act(async () => { finishAction() })
  await act(async () => { finishLoad({ findings }) })
  if (action === 'read') expect(screen.getByText(/duplicateReview.status.read/)).toBeInTheDocument()
  else expect(screen.queryByText('Milk · milkk')).not.toBeInTheDocument()
})

it.each(['read', 'keep_both'] as const)('applies %s after an overlapping stale load finishes', async (action) => {
  const { findings } = await mockList()
  if (action === 'keep_both') mockList.mockResolvedValue({ findings: [{ ...findings[0], unread: false, status: 'read' }] })
  let finishLoad!: (value: unknown) => void
  let finishAction!: () => void
  mockAct.mockImplementationOnce(() => new Promise<void>((resolve) => { finishAction = resolve }))
  const user = userEvent.setup()
  render(<DuplicateReviewBell />)
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
  if (action === 'read') await screen.findByText('1')
  await user.click(screen.getByRole('button', { name: 'duplicateReview.open' }))
  if (action === 'keep_both') await user.click(await screen.findByRole('button', { name: 'duplicateReview.keepBoth' }))
  mockList.mockImplementationOnce(() => new Promise((resolve) => { finishLoad = resolve }))
  act(() => window.dispatchEvent(new Event('focus')))
  await act(async () => { finishLoad({ findings }) })
  await act(async () => { finishAction() })
  if (action === 'read') expect(screen.getByText(/duplicateReview.status.read/)).toBeInTheDocument()
  else expect(screen.queryByText('Milk · milkk')).not.toBeInTheDocument()
})

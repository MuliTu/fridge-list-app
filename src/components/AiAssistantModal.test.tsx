import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AiAssistantModal, { uniqueSuggestedListName } from './AiAssistantModal'
import { analyzeWithAi } from '../client/api/aiAssistant'

let mockUid = 'uid'
let mockListId = 'owner@example.test'
const getAiRetrievalContext = jest.fn()
const createSuggestedList = jest.fn()
const applyAiListReview = jest.fn()
const confirm = jest.fn()
const applyBackgroundAiReview = jest.fn()

jest.mock('../client/api/backgroundAiReview', () => ({ applyBackgroundAiReview: (...args: unknown[]) => applyBackgroundAiReview(...args) }))
jest.mock('../lib/firebase', () => ({ sanitizeEmailKey: (email: string) => email.replaceAll('.', '_') }))

jest.mock('../client/api/aiAssistant', () => {
  class AiAssistantApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string
    ) {
      super(message)
      this.name = 'AiAssistantApiError'
    }
  }
  return { analyzeWithAi: jest.fn(), AiAssistantApiError }
})
jest.mock('../hooks/AuthContext', () => ({ useAuth: () => ({ user: { uid: mockUid, email: 'user@example.com' } }) }))
jest.mock('../hooks/ListContext', () => ({
  useActiveList: () => ({ activeList: { name: 'Home', id: mockListId } }),
  useListApi: () => ({ getAiRetrievalContext, createSuggestedList, applyAiListReview })
}))
jest.mock('../hooks/DialogServiceContext', () => ({ useDialogService: () => ({ confirm }) }))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => options ? `${key}:${JSON.stringify(options)}` : key,
    i18n: { language: 'en' }
  })
}))

describe('AiAssistantModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUid = 'uid'
    mockListId = 'owner@example.test'
    confirm.mockResolvedValue(true)
    getAiRetrievalContext.mockResolvedValue({ items: [], changes: [], purchases: [], categories: [{ name: 'Other' }] })
  })

  it('keeps suggested custom-list names unique', () => {
    expect(uniqueSuggestedListName('Weekend', ['Weekend', 'Weekend (2)'])).toBe('Weekend (3)')
  })

  it('retrieves context, renders insight output, and creates a reviewed list', async () => {
    ;(analyzeWithAi as jest.Mock).mockResolvedValue({
      ignoredCorrectionCount: 1,
      result: {
        mode: 'insights',
        summary: ['Buy milk more often'],
        nextSteps: ['Prepare for the weekend'],
        proposedList: { name: 'Weekend', items: [{ name: 'Milk', category: 'Other', reason: 'Often purchased' }] }
      }
    })
    createSuggestedList.mockResolvedValue({ created: 1 })
    render(<AiAssistantModal onClose={jest.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /insights.title/i }))
    expect(await screen.findByText('Buy milk more often')).toBeInTheDocument()
    expect(screen.getByText(/ignoredCorrections/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ai:createList' }))
    await waitFor(() => expect(createSuggestedList).toHaveBeenCalledWith(
      'Weekend',
      [{ name: 'Milk', category: 'Other', reason: 'Often purchased' }],
      { uid: 'uid', email: 'user@example.com' }
    ))
  })
  it('shows a cached review without a model call and only applies selected items after confirmation', async () => {
    const initialReview = {
      scope: JSON.stringify(['uid', 'owner@example_test']), snapshot: 'snapshot',
      items: [{ key: 'milk', item: 'Milkk', bought: false, list_name: null }],
      result: { mode: 'list_review' as const, duplicates: [], renames: [{
        key: 'milk', currentName: 'Milkk', suggestedName: 'Milk', reason: 'Typo'
      }] }
    }
    const isReviewCurrent = jest.fn(() => true)
    confirm.mockResolvedValueOnce(false)
    applyBackgroundAiReview.mockResolvedValue({
      removed: 0, renamed: 1, skipped: 0, renamedKeys: ['milk'], removedKeys: [], skippedKeys: []
    })
    render(<AiAssistantModal onClose={jest.fn()} initialReview={initialReview} isReviewCurrent={isReviewCurrent} />)
    expect(screen.getByText(/Milkk → Milk/)).toBeVisible()
    expect(analyzeWithAi).not.toHaveBeenCalled()
    const button = screen.getByRole('button', { name: /ai:applySelected/ })
    expect(button).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(button)
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    expect(applyBackgroundAiReview).not.toHaveBeenCalled()
    fireEvent.click(button)
    await waitFor(() => expect(applyBackgroundAiReview).toHaveBeenCalledWith(
      'owner@example_test', 'snapshot', [], [{ key: 'milk', name: 'Milk' }],
      expect.objectContaining({ actorUid: 'uid', operationId: expect.any(String), signal: expect.any(AbortSignal) })
    ))
    expect(applyAiListReview).not.toHaveBeenCalled()
  })

})

it.each(['actor', 'list', 'unmount'])('cancels confirmation when %s changes', async (change) => {
  mockUid = 'uid'; mockListId = 'owner@example.test'
  applyBackgroundAiReview.mockClear()
  let resolve!: (value: boolean) => void
  confirm.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  const initialReview = {
    scope: JSON.stringify(['uid', 'owner@example_test']), snapshot: 'snapshot',
    items: [{ key: 'milk', item: 'Milkk', bought: false, list_name: null }],
    result: { mode: 'list_review' as const, duplicates: [], renames: [{
      key: 'milk', currentName: 'Milkk', suggestedName: 'Milk', reason: 'Typo'
    }] }
  }
  const props = { onClose: jest.fn(), initialReview, isReviewCurrent: () => true }
  const view = render(<AiAssistantModal {...props} />)
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: /ai:applySelected/ }))
  if (change === 'actor') mockUid = 'other'
  if (change === 'list') mockListId = 'other@example.test'
  if (change === 'unmount') view.unmount()
  else view.rerender(<AiAssistantModal {...props} />)
  resolve(true)
  await waitFor(() => expect(applyBackgroundAiReview).not.toHaveBeenCalled())
})

it('retries the same confirmed operation after an uncertain response and realtime snapshot change', async () => {
  mockUid = 'uid'; mockListId = 'owner@example.test'
  applyBackgroundAiReview.mockReset()
  confirm.mockResolvedValue(true)
  const initialReview = {
    scope: JSON.stringify(['uid', 'owner@example_test']), snapshot: 'snapshot',
    items: [{ key: 'milk', item: 'Milkk', bought: false, list_name: null }],
    result: { mode: 'list_review' as const, duplicates: [], renames: [{
      key: 'milk', currentName: 'Milkk', suggestedName: 'Milk', reason: 'Typo'
    }] }
  }
  let current = true
  applyBackgroundAiReview.mockImplementationOnce(async () => { current = false; throw new Error('Response lost') })
    .mockResolvedValue({ removed: 0, renamed: 1, skipped: 0, renamedKeys: ['milk'], removedKeys: [], skippedKeys: [] })
  render(<AiAssistantModal onClose={jest.fn()} initialReview={initialReview} isReviewCurrent={() => current} />)
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: /ai:applySelected/ }))
  await screen.findByText('ai:applyError')
  const retry = screen.getByRole('button', { name: /ai:applySelected/ })
  expect(retry).toBeEnabled()
  fireEvent.click(retry)
  await waitFor(() => expect(applyBackgroundAiReview).toHaveBeenCalledTimes(2))
  expect(applyBackgroundAiReview.mock.calls[1][4].operationId).toBe(applyBackgroundAiReview.mock.calls[0][4].operationId)
})

it('shows category-only findings and submits selected moves after confirmation', async () => {
  mockUid = 'uid'; mockListId = 'owner@example.test'
  applyBackgroundAiReview.mockClear()
  const initialReview = {
    scope: JSON.stringify(['uid', 'owner@example_test']), snapshot: 'snapshot',
    items: [{ key: 'peach', item: 'אפרסק', bought: false, list_name: null, category: 'אחר' }],
    result: {
      mode: 'list_review' as const, duplicates: [], renames: [],
      categoryChanges: [{ key: 'peach', category: 'פירות', reason: 'The category matches this product type' }]
    }
  }
  confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  applyBackgroundAiReview.mockResolvedValue({
    removed: 0, renamed: 0, skipped: 0, recategorized: 1,
    renamedKeys: [], removedKeys: [], skippedKeys: [], recategorizedKeys: ['peach']
  })
  render(<AiAssistantModal onClose={jest.fn()} initialReview={initialReview} isReviewCurrent={() => true} />)
  expect(screen.getByText('The category matches this product type')).toBeVisible()
  const apply = screen.getByRole('button', { name: /ai:applySelected/ })
  expect(apply).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(apply)
  await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/^ai:reviewConfirmWithCategories:/)))
  expect(applyBackgroundAiReview).not.toHaveBeenCalled()
  fireEvent.click(apply)
  await waitFor(() => expect(applyBackgroundAiReview).toHaveBeenCalledWith(
    'owner@example_test', 'snapshot', [], [],
    expect.objectContaining({ categoryChanges: [{ key: 'peach', category: 'פירות' }] })
  ))
  expect(await screen.findByText(/^ai:reviewSuccessWithCategories:/)).toBeVisible()
})

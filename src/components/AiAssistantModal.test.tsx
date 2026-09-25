import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AiAssistantModal, { uniqueSuggestedListName } from './AiAssistantModal'
import { analyzeWithAi } from '../client/api/aiAssistant'

const getAiRetrievalContext = jest.fn()
const createSuggestedList = jest.fn()
const applyAiListReview = jest.fn()
const confirm = jest.fn()

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
jest.mock('../hooks/AuthContext', () => ({ useAuth: () => ({ user: { email: 'user@example.com' } }) }))
jest.mock('../hooks/ListContext', () => ({
  useActiveList: () => ({ activeList: { name: 'Home' } }),
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
      { email: 'user@example.com' }
    ))
  })
})

import { render, screen } from '@testing-library/react'
import PurchaseInsightsModal from './PurchaseInsightsModal'
import { usePurchaseInsights } from '../hooks/usePurchaseInsights'
import { usePurchaseHabitSummary } from '../hooks/usePurchaseHabitSummary'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key
  })
}))

jest.mock('../hooks/usePurchaseInsights', () => ({
  usePurchaseInsights: jest.fn()
}))

jest.mock('../hooks/usePurchaseHabitSummary', () => ({
  usePurchaseHabitSummary: jest.fn()
}))

describe('PurchaseInsightsModal', () => {
  beforeEach(() => {
    // Default: no habit changes detected, nothing loading/erroring — individual tests
    // override this to exercise the habits section's other states.
    ;(usePurchaseHabitSummary as jest.Mock).mockReturnValue({ summary: null, loading: false, error: false })
  })

  it('shows the empty state for every section when there is no purchase history', () => {
    ;(usePurchaseInsights as jest.Mock).mockReturnValue({ weekly: [], monthly: [], frequent: [] })
    render(<PurchaseInsightsModal onClose={jest.fn()} />)

    expect(screen.getAllByText('empty')).toHaveLength(3)
  })

  it('renders each section\'s items with their counts', () => {
    ;(usePurchaseInsights as jest.Mock).mockReturnValue({
      weekly: [{ itemName: 'חלב', count: 2 }],
      monthly: [{ itemName: 'חלב', count: 5 }],
      frequent: [
        { itemName: 'חלב', count: 12 },
        { itemName: 'לחם', count: 8 }
      ]
    })
    render(<PurchaseInsightsModal onClose={jest.fn()} />)

    expect(screen.getByText('itemCount:{"itemName":"חלב","count":2}')).toBeInTheDocument()
    expect(screen.getByText('itemCount:{"itemName":"חלב","count":5}')).toBeInTheDocument()
    expect(screen.getByText('itemCount:{"itemName":"חלב","count":12}')).toBeInTheDocument()
    expect(screen.getByText('itemCount:{"itemName":"לחם","count":8}')).toBeInTheDocument()
  })

  describe('habit-change summary section', () => {
    beforeEach(() => {
      ;(usePurchaseInsights as jest.Mock).mockReturnValue({ weekly: [], monthly: [], frequent: [] })
    })

    it('shows a loading state while the summary is being fetched', () => {
      ;(usePurchaseHabitSummary as jest.Mock).mockReturnValue({ summary: null, loading: true, error: false })
      render(<PurchaseInsightsModal onClose={jest.fn()} />)

      expect(screen.getByText('habitsLoading')).toBeInTheDocument()
    })

    it('shows an error message without hiding the rest of the modal when the summary call fails', () => {
      ;(usePurchaseHabitSummary as jest.Mock).mockReturnValue({ summary: null, loading: false, error: true })
      render(<PurchaseInsightsModal onClose={jest.fn()} />)

      expect(screen.getByText('habitsError')).toBeInTheDocument()
      // The three windowed-count sections are still rendered (their own empty state).
      expect(screen.getAllByText('empty')).toHaveLength(3)
    })

    it('shows an empty state when there is nothing to summarize', () => {
      ;(usePurchaseHabitSummary as jest.Mock).mockReturnValue({ summary: null, loading: false, error: false })
      render(<PurchaseInsightsModal onClose={jest.fn()} />)

      expect(screen.getByText('habitsEmpty')).toBeInTheDocument()
    })

    it('renders each sentence of a resolved summary', () => {
      ;(usePurchaseHabitSummary as jest.Mock).mockReturnValue({
        summary: ['You’ve been buying a lot more coffee lately.', 'Diaper purchases have stopped.'],
        loading: false,
        error: false
      })
      render(<PurchaseInsightsModal onClose={jest.fn()} />)

      expect(screen.getByText('You’ve been buying a lot more coffee lately.')).toBeInTheDocument()
      expect(screen.getByText('Diaper purchases have stopped.')).toBeInTheDocument()
    })
  })
})

import { render, screen } from '@testing-library/react'
import PurchaseInsightsModal from './PurchaseInsightsModal'
import { usePurchaseInsights } from '../hooks/usePurchaseInsights'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key
  })
}))

jest.mock('../hooks/usePurchaseInsights', () => ({
  usePurchaseInsights: jest.fn()
}))

describe('PurchaseInsightsModal', () => {
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
})

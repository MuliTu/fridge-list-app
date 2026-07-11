import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RestockPrompt from './RestockPrompt'
import type { StockItem } from '../types'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)
  })
}))

const existingStock: StockItem = {
  key: 'stock-1',
  name: 'ביצים',
  category: 'dairy',
  quantity: 6,
  unit: 'יח\'',
  low_threshold: 2,
  updated_at: '2026-07-01T00:00:00.000Z'
}

describe('RestockPrompt', () => {
  it('uses the "update existing" message when the item is already in stock', () => {
    render(<RestockPrompt itemName="ביצים" existing={existingStock} onConfirm={jest.fn()} onDismiss={jest.fn()} />)
    expect(screen.getByText(/common:restockPrompt\.message:/)).toBeInTheDocument()
    expect(screen.queryByText(/common:restockPrompt\.messageNew:/)).not.toBeInTheDocument()
  })

  it('uses the "add new" message when the item is not yet in stock', () => {
    render(<RestockPrompt itemName="חלב" existing={null} onConfirm={jest.fn()} onDismiss={jest.fn()} />)
    expect(screen.getByText(/common:restockPrompt\.messageNew:/)).toBeInTheDocument()
  })

  it('confirms with the default amount of 1', async () => {
    const onConfirm = jest.fn()
    const user = userEvent.setup()
    render(<RestockPrompt itemName="חלב" existing={null} onConfirm={onConfirm} onDismiss={jest.fn()} />)

    await user.click(screen.getByRole('button', { name: 'common:restockPrompt.addToStock' }))
    expect(onConfirm).toHaveBeenCalledWith(1)
  })

  it('dismisses without confirming when skip is clicked', async () => {
    const onConfirm = jest.fn()
    const onDismiss = jest.fn()
    const user = userEvent.setup()
    render(<RestockPrompt itemName="חלב" existing={null} onConfirm={onConfirm} onDismiss={onDismiss} />)

    await user.click(screen.getByRole('button', { name: 'common:restockPrompt.skip' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

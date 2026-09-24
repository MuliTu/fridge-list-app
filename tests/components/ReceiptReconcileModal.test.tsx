import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReceiptReconcileModal, type ReconcileMatch } from '../../src/components/ReceiptReconcileModal'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key)
  })
}))

const matchWithStock: ReconcileMatch = {
  item: { name: 'חלב', price: 6.5, quantity: 2 },
  stockMatch: {
    key: 'stock-1',
    name: 'חלב',
    category: 'dairy',
    quantity: 1,
    unit: "ליטר",
    low_threshold: 1,
    updated_at: '2026-07-01T00:00:00.000Z'
  },
  groceryMatch: null,
  suggestedCategory: 'dairy'
}

const matchWithoutStock: ReconcileMatch = {
  item: { name: 'עגבניות', price: 8, quantity: 1 },
  stockMatch: null,
  groceryMatch: null,
  suggestedCategory: 'vegetables'
}

describe('ReceiptReconcileModal', () => {
  it('shows how many products were found on the receipt', () => {
    render(<ReceiptReconcileModal matches={[matchWithStock, matchWithoutStock]} onClose={jest.fn()} onConfirm={jest.fn()} />)

    // The count line and the description share a parent <p>, split across sibling
    // text nodes by the JSX interpolation — a plain getByText element match is
    // ambiguous here (matches at multiple DOM levels), so just check it's present
    // in the rendered output at all.
    expect(document.body.textContent).toContain('receipts:reconcile.foundCount:{"count":2}')
  })

  it('defaults the stock checkbox ON for an existing match, and OFF for a brand-new product', () => {
    render(<ReceiptReconcileModal matches={[matchWithStock, matchWithoutStock]} onClose={jest.fn()} onConfirm={jest.fn()} />)

    const checkboxes = screen.getAllByRole('checkbox')
    // Row 1 (existing stock match): [stock checked, grocery checked]
    // Row 2 (no stock match): [stock UNCHECKED, grocery checked]
    expect(checkboxes[0]).toHaveAttribute('data-state', 'checked')
    expect(checkboxes[1]).toHaveAttribute('data-state', 'checked')
    expect(checkboxes[2]).toHaveAttribute('data-state', 'unchecked')
    expect(checkboxes[3]).toHaveAttribute('data-state', 'checked')
  })

  it('offers to add a brand-new product to stock, not just update an existing one', () => {
    render(<ReceiptReconcileModal matches={[matchWithoutStock]} onClose={jest.fn()} onConfirm={jest.fn()} />)

    expect(screen.getByText('receipts:reconcile.addNewStock:{"quantity":1}')).toBeInTheDocument()
  })

  it('calls onConfirm with the current selections and shows a saving state while it resolves', async () => {
    let resolveConfirm: () => void = () => {}
    const onConfirm = jest.fn(() => new Promise<void>((resolve) => (resolveConfirm = resolve)))
    const user = userEvent.setup()

    render(<ReceiptReconcileModal matches={[matchWithStock]} onClose={jest.fn()} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'receipts:reconcile.apply' }))

    expect(onConfirm).toHaveBeenCalledWith([{ stock: true, grocery: true }])
    expect(screen.getByRole('button', { name: 'receipts:reconcile.applying' })).toBeDisabled()

    resolveConfirm()
  })

  it('re-enables the form if the update fails, instead of leaving it stuck', async () => {
    const onConfirm = jest.fn(() => Promise.reject(new Error('network error')))
    const user = userEvent.setup()

    render(<ReceiptReconcileModal matches={[matchWithStock]} onClose={jest.fn()} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'receipts:reconcile.apply' }))

    expect(await screen.findByRole('button', { name: 'receipts:reconcile.apply' })).not.toBeDisabled()
  })
})

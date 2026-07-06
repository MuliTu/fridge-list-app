import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GroceryItem, ReceiptItem, StockItem } from '../types'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

export interface ReconcileMatch {
  item: ReceiptItem
  stockMatch: StockItem | null
  groceryMatch: GroceryItem | null
  suggestedCategory: string
}

interface Selection {
  stock: boolean
  grocery: boolean
}

interface ReceiptReconcileModalProps {
  matches: ReconcileMatch[]
  onClose: () => void
  onConfirm: (selections: Selection[]) => void
}

export default function ReceiptReconcileModal({ matches, onClose, onConfirm }: ReceiptReconcileModalProps) {
  const { t } = useTranslation(['receipts', 'common'])
  const [selections, setSelections] = useState<Selection[]>(matches.map((m) => ({ stock: !!m.stockMatch, grocery: true })))

  const toggle = (index: number, field: keyof Selection) => {
    setSelections((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: !s[field] } : s)))
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('receipts:reconcile.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground m-0 whitespace-pre-wrap">
          {t('receipts:reconcile.description')}
        </p>
        <div className="reconcile-list">
          {matches.map((m, i) => (
            <div className="reconcile-row" key={i}>
              <div className="reconcile-item-name">{m.item.name}</div>
              {m.stockMatch && (
                <label className="reconcile-checkbox">
                  <input
                    type="checkbox"
                    checked={selections[i].stock}
                    onChange={() => toggle(i, 'stock')}
                  />
                  {t('receipts:reconcile.updateStock', {
                    quantity: m.item.quantity || 1,
                    unit: m.stockMatch.unit
                  })}
                </label>
              )}
              <label className="reconcile-checkbox">
                <input type="checkbox" checked={selections[i].grocery} onChange={() => toggle(i, 'grocery')} />
                {t(m.groceryMatch ? 'receipts:reconcile.markPurchased' : 'receipts:reconcile.addAsPurchased')}
              </label>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('receipts:reconcile.skipAll')}
          </Button>
          <Button onClick={() => onConfirm(selections)}>{t('receipts:reconcile.apply')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

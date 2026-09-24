import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GroceryItem, ReceiptItem, StockItem } from '../types'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'

export type ReconcileMatch = {
  item: ReceiptItem
  stockMatch: StockItem | null
  groceryMatch: GroceryItem | null
  suggestedCategory: string
}

type Selection = {
  stock: boolean
  grocery: boolean
}

type ReceiptReconcileModalProps = {
  matches: ReconcileMatch[]
  onClose: () => void
  onConfirm: (selections: Selection[]) => Promise<unknown>
}

export const ReceiptReconcileModal = ({ matches, onClose, onConfirm }: ReceiptReconcileModalProps) => {
  const { t } = useTranslation(['receipts', 'common'])
  // Existing stock match: default checked (low-risk, just bumping a quantity).
  // No match: default UNCHECKED — creating a brand-new stock item is a bigger
  // commitment than updating one, so it shouldn't happen just because the user
  // clicked through the defaults.
  const [selections, setSelections] = useState<Selection[]>(matches.map((m) => ({ stock: !!m.stockMatch, grocery: true })))
  const [saving, setSaving] = useState(false)

  const toggle = (index: number, field: keyof Selection) => {
    setSelections((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: !s[field] } : s)))
  }

  const handleConfirm = async () => {
    setSaving(true)
    try {
      await onConfirm(selections)
    } catch {
      // The caller (receipts.tsx) is responsible for surfacing the actual error to
      // the user (via useDialogService's alert) — this only needs to make sure the
      // form doesn't stay stuck disabled forever if onConfirm rejects for any reason.
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('receipts:reconcile.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground m-0 whitespace-pre-wrap">
          {t('receipts:reconcile.foundCount', { count: matches.length })}
          {'\n'}
          {t('receipts:reconcile.description')}
        </p>
        <div className="reconcile-list">
          {matches.map((m, i) => (
            <div className="reconcile-row" key={i}>
              <div className="reconcile-item-name">{m.item.name}</div>
              <label className="reconcile-checkbox">
                <Checkbox
                  checked={selections[i].stock}
                  onCheckedChange={() => toggle(i, 'stock')}
                  disabled={saving}
                />
                {m.stockMatch
                  ? t('receipts:reconcile.updateStock', {
                      quantity: m.item.quantity || 1,
                      unit: m.stockMatch.unit
                    })
                  : t('receipts:reconcile.addNewStock', { quantity: m.item.quantity || 1 })}
              </label>
              <label className="reconcile-checkbox">
                <Checkbox checked={selections[i].grocery} onCheckedChange={() => toggle(i, 'grocery')} disabled={saving} />
                {t(m.groceryMatch ? 'receipts:reconcile.markPurchased' : 'receipts:reconcile.addAsPurchased')}
              </label>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('receipts:reconcile.skipAll')}
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? t('receipts:reconcile.applying') : t('receipts:reconcile.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

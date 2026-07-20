import { useTranslation } from 'react-i18next'
import { usePurchaseInsights } from '../hooks/usePurchaseInsights'
import type { PurchaseInsightItem } from '../lib/purchaseInsights'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

interface PurchaseInsightsModalProps {
  onClose: () => void
}

// Simple counts-and-names view over the purchase-event log (see PurchaseEvent in
// types.ts, computePurchaseInsights in lib/purchaseInsights.ts) — no charts/graphs,
// per this ticket's explicit scope (that's a nice-to-have, not required). Habit-
// change detection and an AI-generated natural-language summary are a separate
// follow-up ticket (P3) that builds on top of this same aggregation, not built here.
export default function PurchaseInsightsModal({ onClose }: PurchaseInsightsModalProps) {
  const { t } = useTranslation('purchaseInsights')
  const { weekly, monthly, frequent } = usePurchaseInsights()

  const renderSection = (title: string, items: PurchaseInsightItem[]) => (
    <div className="mt-4 first:mt-0">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="modal-note-readonly">{t('empty')}</p>
      ) : (
        <ul className="list-disc ps-5">
          {items.map((entry) => (
            <li key={entry.itemName}>{t('itemCount', { itemName: entry.itemName, count: entry.count })}</li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <p className="modal-note-readonly">{t('explanation')}</p>

        {renderSection(t('weeklyTitle'), weekly)}
        {renderSection(t('monthlyTitle'), monthly)}
        {renderSection(t('frequentTitle'), frequent)}

        <DialogFooter>
          <Button onClick={onClose}>{t('common:actions.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useTranslation } from 'react-i18next'
import { usePurchaseInsights } from '../hooks/usePurchaseInsights'
import { usePurchaseHabitSummary } from '../hooks/usePurchaseHabitSummary'
import type { PurchaseInsightItem } from '../lib/purchaseInsights'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

type PurchaseInsightsModalProps = {
  onClose: () => void
}

// Simple counts-and-names view over the purchase-event log (see PurchaseEvent in
// types.ts, computePurchaseInsights in lib/purchaseInsights.ts) — no charts/graphs,
// per this ticket's explicit scope (that's a nice-to-have, not required).
//
// P3 addition: a "buying habit changes" section below the three windowed-count
// sections, sourced from computeHabitChanges (src/lib/purchaseHabitChanges.ts, run
// inside usePurchaseInsights off the same event data) and a Gemini-written plain-
// language summary of those changes (usePurchaseHabitSummary,
// /api/purchase-habit-summary — see that route for the n8n-workflow-not-yet-built
// caveat). Deliberately isolated in its own hook/loading/error state so a failure
// fetching the summary (network error, or simply because the n8n workflow doesn't
// exist yet) never affects the three sections above, which keep working exactly as
// before — same graceful-degradation house style as ChangelogModal/WhatsNewModal.
export const PurchaseInsightsModal = ({ onClose }: PurchaseInsightsModalProps) => {
  const { t } = useTranslation('purchaseInsights')
  const { weekly, monthly, frequent, habitChanges = [] } = usePurchaseInsights()
  const { summary, loading: summaryLoading, error: summaryError } = usePurchaseHabitSummary(habitChanges)

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

        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">{t('habitsTitle')}</h3>
          {summaryLoading ? (
            <p className="modal-note-readonly">{t('habitsLoading')}</p>
          ) : summaryError ? (
            <p className="modal-note-readonly">{t('habitsError')}</p>
          ) : !summary || summary.length === 0 ? (
            <p className="modal-note-readonly">{t('habitsEmpty')}</p>
          ) : (
            <ul className="list-disc ps-5">
              {summary.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>{t('common:actions.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

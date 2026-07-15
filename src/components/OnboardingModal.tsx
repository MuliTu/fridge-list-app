import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { cn } from '../lib/utils'

interface OnboardingModalProps {
  onClose: (dontShowAgain: boolean) => void
}

const STEP_KEYS = ['welcome', 'addItems', 'organize', 'stock', 'receipts', 'sharing'] as const

const mockChipClass = 'rounded-full px-3 py-1 text-sm text-white'
const mockCardClass = 'flex items-center justify-between gap-2 rounded-xl bg-background px-3 py-2 text-sm'

// Static, illustrative mock UI per step — deliberately not reusing the real
// ShoppingListItemRow/CategorySection/etc. components, which all expect real
// Firebase-shaped data (GroceryItem, StockItem...). This is a first-run walkthrough
// with no backing data, so a lightweight Tailwind mockup keeps it fully decoupled
// from the live app state.
function StepVisual({ step, t }: { step: (typeof STEP_KEYS)[number]; t: (key: string) => string }) {
  switch (step) {
    case 'welcome':
      return (
        <div className="flex items-center justify-center gap-2 py-2 text-3xl">
          <span>🛒</span>
          <span>🏠</span>
          <span>🎙️</span>
        </div>
      )
    case 'addItems':
      return (
        <div className="flex flex-col gap-2">
          <div className={mockCardClass}>
            <span className="flex items-center gap-2">
              <span>🥛</span>
              <span>{t('steps.addItems.mock.item1Name')}</span>
            </span>
            <span className="text-xs text-muted-foreground">{t('steps.addItems.mock.item1Meta')}</span>
          </div>
          <div className={cn(mockCardClass, 'opacity-60')}>
            <span className="flex items-center gap-2 line-through">
              <Checkbox checked disabled />
              <span>🍞</span>
              <span>{t('steps.addItems.mock.item2Name')}</span>
            </span>
            <span className="text-xs text-muted-foreground">{t('steps.addItems.mock.item2Meta')}</span>
          </div>
        </div>
      )
    case 'organize':
      return (
        <div className="flex flex-wrap justify-center gap-2 py-1">
          <span className={mockChipClass} style={{ backgroundColor: '#8fbf6a' }}>
            🥕 {t('steps.organize.mock.cat1')}
          </span>
          <span className={mockChipClass} style={{ backgroundColor: '#f0c96b' }}>
            🥛 {t('steps.organize.mock.cat2')}
          </span>
          <span className={mockChipClass} style={{ backgroundColor: '#c9975a' }}>
            🍞 {t('steps.organize.mock.cat3')}
          </span>
        </div>
      )
    case 'stock':
      return (
        <div className={cn(mockCardClass, 'shadow-[inset_0_0_0_1px_rgba(201,106,90,0.5)]')}>
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <span>🧻</span>
              <span>{t('steps.stock.mock.itemName')}</span>
            </span>
            <span className="text-xs text-muted-foreground">{t('steps.stock.mock.quantity')}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive">
              {t('steps.stock.mock.lowStock')}
            </span>
            <Button size="sm" variant="secondary" disabled>
              {t('steps.stock.mock.addToList')}
            </Button>
          </span>
        </div>
      )
    case 'receipts':
      return (
        <div className="rounded-xl bg-background p-3 text-sm">
          <div className="flex items-center justify-between font-medium">
            <span>🧾 {t('steps.receipts.mock.storeName')}</span>
            <span>{t('steps.receipts.mock.total')}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{t('steps.receipts.mock.priceUp')}</div>
        </div>
      )
    case 'sharing':
      return (
        <div className="flex flex-wrap justify-center gap-2 py-1">
          <span className="rounded-full border border-border px-3 py-1 text-sm">
            📋 {t('steps.sharing.mock.list1')}
          </span>
          <span className="rounded-full border border-border px-3 py-1 text-sm">
            🎉 {t('steps.sharing.mock.list2')}
          </span>
          <span className="rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground">
            {t('steps.sharing.mock.newList')}
          </span>
        </div>
      )
    default:
      return null
  }
}

export default function OnboardingModal({ onClose }: OnboardingModalProps) {
  const { t } = useTranslation('onboarding')
  const [step, setStep] = useState(0)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  const stepKey = STEP_KEYS[step]
  const isLast = step === STEP_KEYS.length - 1

  const finish = () => onClose(dontShowAgain)

  return (
    <Dialog open onOpenChange={(open) => !open && finish()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t(`steps.${stepKey}.title`)}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{t(`steps.${stepKey}.body`)}</p>

        <div className="rounded-2xl border border-border bg-input/40 p-4">
          <StepVisual step={stepKey} t={t} />
        </div>

        <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
          {STEP_KEYS.map((k, i) => (
            <span key={k} className={cn('h-1.5 w-1.5 rounded-full', i === step ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>

        {isLast && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            />
            {t('dontShowAgain')}
          </label>
        )}

        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="ghost" onClick={finish}>
            {t('skip')}
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                {t('back')}
              </Button>
            )}
            {isLast ? (
              <Button onClick={finish}>{t('done')}</Button>
            ) : (
              <Button onClick={() => setStep((s) => s + 1)}>{t('next')}</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

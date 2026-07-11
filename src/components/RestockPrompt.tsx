import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StockItem } from '../types'
import { StockUnit } from '../lib/units'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

interface RestockPromptProps {
  itemName: string
  // The matching stock item when one already exists (confirm adds to its quantity), or
  // null when the item isn't tracked in stock yet (confirm creates a fresh entry).
  existing: StockItem | null
  onConfirm: (amount: number) => void
  onDismiss: () => void
}

export default function RestockPrompt({ itemName, existing, onConfirm, onDismiss }: RestockPromptProps) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState<string | number>(1)
  const unit = existing?.unit || StockUnit.Piece

  return (
    <Dialog open onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('common:restockPrompt.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground m-0 whitespace-pre-wrap">
          {existing
            ? t('common:restockPrompt.message', { itemName })
            : t('common:restockPrompt.messageNew', { itemName })}
        </p>
        <Label>
          {t('common:restockPrompt.quantityLabel', { unit })}
          <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Label>
        <DialogFooter>
          <Button variant="secondary" onClick={onDismiss}>
            {t('common:restockPrompt.skip')}
          </Button>
          <Button onClick={() => onConfirm(Math.max(0, Number(amount) || 0))}>
            {t('common:restockPrompt.addToStock')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

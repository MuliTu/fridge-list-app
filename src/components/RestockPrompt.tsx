import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StockItem } from '../types'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

interface RestockPromptProps {
  item: StockItem
  onConfirm: (amount: number) => void
  onDismiss: () => void
}

export default function RestockPrompt({ item, onConfirm, onDismiss }: RestockPromptProps) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState<string | number>(1)

  return (
    <Dialog open onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('common:restockPrompt.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground m-0 whitespace-pre-wrap">
          {t('common:restockPrompt.message', { itemName: item.name })}
        </p>
        <Label>
          {t('common:restockPrompt.quantityLabel', { unit: item.unit })}
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

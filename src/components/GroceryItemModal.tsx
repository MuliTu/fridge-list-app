import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { categorizeItem } from '../lib/firebase'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { NO_UNIT, OTHER_UNIT, UNIT_PRESETS, resolveQuantityUnit } from '../lib/units'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface GroceryItemModalProps {
  listName: string | null
  // Pre-fills the name field — used when this modal is opened from the shopping
  // list search's "no results, add it?" prompt (SearchSuggestAdd) instead of the
  // usual empty-start FAB. Absent/undefined leaves the field empty as before.
  initialName?: string
  onClose: () => void
  onAdd: (item: {
    name: string
    category: string
    quantity?: number | null
    unit?: string | null
  }) => Promise<unknown> | PromiseLike<unknown>
}

export default function GroceryItemModal({ listName, initialName, onClose, onAdd }: GroceryItemModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(initialName ?? '')
  const [quantityText, setQuantityText] = useState('')
  const [unit, setUnit] = useState<string>(NO_UNIT)
  const [customUnit, setCustomUnit] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('common:groceryItem.nameRequired'))
      return
    }

    const resolved = resolveQuantityUnit({ quantityText, unit, customUnit })
    if (resolved.error) {
      setError(t(`common:quantityUnit.${resolved.error}`))
      return
    }

    setSaving(true)
    setError(null)
    try {
      let items: { item: string; category: string }[]
      try {
        items = await categorizeItem(trimmed)
      } catch {
        items = []
      }
      if (items.length === 0) {
        items = [{ item: trimmed, category: OTHER_CATEGORY_NAME }]
      }
      for (const { item, category } of items) {
        await onAdd({ name: item, category, quantity: resolved.quantity, unit: resolved.unit })
      }
      onClose()
    } catch (err: any) {
      setError(`${t('common:groceryItem.addFailed')}: ${err.message}`)
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('common:groceryItem.title', { listName })}</DialogTitle>
        </DialogHeader>

        <Input
          placeholder={t('common:groceryItem.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="modal-input-row">
          <Label>
            {t('stock:editModal.quantity')}
            <Input
              type="number"
              min="0"
              step="any"
              value={quantityText}
              onChange={(e) => setQuantityText(e.target.value)}
            />
          </Label>
          <Label>
            {t('stock:editModal.unit')}
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_UNIT}>{t('common:quantityUnit.noUnit')}</SelectItem>
                {UNIT_PRESETS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER_UNIT}>{t('stock:editModal.otherUnit')}</SelectItem>
              </SelectContent>
            </Select>
          </Label>
        </div>

        {unit === OTHER_UNIT && (
          <Input
            placeholder={t('stock:editModal.customUnitPlaceholder')}
            value={customUnit}
            onChange={(e) => setCustomUnit(e.target.value)}
          />
        )}

        {error && <div className="text-sm text-destructive">{error}</div>}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleAdd} disabled={saving}>
            {saving ? t('common:groceryItem.categorizing') : t('common:actions.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

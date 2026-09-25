import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { categorizeItem } from '../lib/firebase'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { normalizeName } from '../lib/normalizeName'
import { NO_UNIT, OTHER_UNIT, UNIT_PRESETS, resolveQuantityUnit } from '../lib/units'
import { enrichItemsWithAi } from '../client/api/aiItemEnrichment'
import type { Category } from '../types'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Checkbox } from './ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface GroceryItemModalProps {
  listName: string | null
  // Pre-fills the name field — used when this modal is opened from the shopping
  // list search's "no results, add it?" prompt (SearchSuggestAdd) instead of the
  // usual empty-start FAB. Absent/undefined leaves the field empty as before.
  initialName?: string
  categories?: Category[]
  onClose: () => void
  onAdd: (item: {
    name: string
    category: string
    quantity?: number | null
    unit?: string | null
  }) => Promise<unknown> | PromiseLike<unknown>
  onAddCategory?: (category: {
    name: string
    color: string
    icon?: string
    order?: number
  }) => Promise<unknown> | PromiseLike<unknown>
}

export default function GroceryItemModal({
  listName,
  initialName,
  categories = [],
  onClose,
  onAdd,
  onAddCategory
}: GroceryItemModalProps) {
  const { t, i18n } = useTranslation()
  const [name, setName] = useState(initialName ?? '')
  const [quantityText, setQuantityText] = useState('')
  const [unit, setUnit] = useState<string>(NO_UNIT)
  const [customUnit, setCustomUnit] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiEnabled, setAiEnabled] = useState(false)

  const categoryNames = categories.map((entry) => entry.name)

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
      if (aiEnabled) {
        const result = await enrichItemsWithAi({
          language: i18n?.language === 'en' ? 'en' : 'he',
          categories: categoryNames.length > 0 ? categoryNames : [OTHER_CATEGORY_NAME],
          items: [{ id: 'single-item', name: trimmed }]
        })
        const suggestion = result.items[0]
        if (!suggestion) throw new Error(t('common:groceryItem.aiNoResult'))
        const existingCategory = categoryNames.find(
          (entry) => normalizeName(entry) === normalizeName(suggestion.category)
        )
        if (!existingCategory && onAddCategory) {
          const nextOrder = categories.reduce((max, entry) => Math.max(max, entry.order ?? 0), 0) + 1
          await onAddCategory({ name: suggestion.category, color: '#94a3b8', icon: '📌', order: nextOrder })
        }
        await onAdd({
          name: suggestion.correctedName,
          category: existingCategory ?? suggestion.category,
          quantity: resolved.quantity,
          unit: resolved.unit
        })
        onClose()
        return
      }

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
          <Label className="me-auto flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={aiEnabled}
              disabled={saving}
              onCheckedChange={(checked) => {
                setAiEnabled(checked === true)
              }}
            />
            {t('common:groceryItem.aiAssistant')}
          </Label>
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

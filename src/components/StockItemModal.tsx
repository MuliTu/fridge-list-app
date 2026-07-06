import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '../lib/formatDateTime'
import type { Category, StockItem } from '../types'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { StockUnit, UNIT_PRESETS, OTHER_UNIT } from '../lib/units'

interface StockItemFields {
  name: string
  category: string
  quantity: number
  unit: string
  low_threshold: number
}

interface StockItemModalProps {
  item: StockItem | null
  categories: Category[]
  onClose: () => void
  onSubmit: (fields: StockItemFields) => Promise<unknown> | PromiseLike<unknown>
}

export default function StockItemModal({ item, categories, onClose, onSubmit }: StockItemModalProps) {
  const { t } = useTranslation(['stock', 'common'])
  const isEdit = !!item
  const [name, setName] = useState(item?.name || '')
  const [category, setCategory] = useState(item?.category || categories[0]?.name || '')
  const [quantity, setQuantity] = useState<string | number>(item?.quantity ?? 1)
  const initialUnit = item?.unit || StockUnit.Piece
  const initialIsCustom = !(UNIT_PRESETS as string[]).includes(initialUnit)
  const [unit, setUnit] = useState(initialIsCustom ? OTHER_UNIT : initialUnit)
  const [customUnit, setCustomUnit] = useState(initialIsCustom ? initialUnit : '')
  const [lowThreshold, setLowThreshold] = useState<string | number>(item?.low_threshold ?? 1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updatedAt = isEdit ? formatDateTime(item.updated_at) : null

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError(t('stock:editModal.nameRequired'))
      return
    }
    setSaving(true)
    setError(null)
    const effectiveUnit = unit === OTHER_UNIT ? customUnit.trim() : unit
    try {
      await onSubmit({
        name: name.trim(),
        category,
        quantity: Math.max(0, Number(quantity) || 0),
        unit: effectiveUnit || StockUnit.Piece,
        low_threshold: Math.max(0, Number(lowThreshold) || 0)
      })
      onClose()
    } catch (err: any) {
      const prefix = isEdit ? t('stock:editModal.updateFailedPrefix') : t('stock:editModal.addFailedPrefix')
      const message = String(err?.code || err?.message || '').includes('PERMISSION_DENIED')
        ? t('stock:errors.permissionDenied')
        : err.message
      setError(prefix + message)
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('stock:editModal.titleEdit') : t('stock:editModal.title')}</DialogTitle>
        </DialogHeader>

        <Input
          placeholder={t('stock:editModal.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.key} value={c.name}>
                {c.icon} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="modal-input-row">
          <Label>
            {t('stock:editModal.quantity')}
            <Input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Label>
          <Label>
            {t('stock:editModal.unit')}
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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

        <Label>
          {t('stock:editModal.lowThreshold')}
          <Input type="number" min="0" value={lowThreshold} onChange={(e) => setLowThreshold(e.target.value)} />
        </Label>

        {isEdit && updatedAt && (
          <div className="modal-meta">
            <div>
              {item.updated_by
                ? t('stock:editModal.updatedAtWithEmail', { date: updatedAt, email: item.updated_by })
                : t('stock:editModal.updatedAt', { date: updatedAt })}
            </div>
          </div>
        )}

        {error && <div className="text-sm text-destructive">{error}</div>}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? t('common:actions.saving') : isEdit ? t('common:actions.save') : t('common:actions.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

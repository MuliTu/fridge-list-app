import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '../lib/formatDateTime'
import type { Category, StockItem } from '../types'

const UNIT_PRESETS = ['יח\'', 'ק"ג', 'גרם', 'ליטר', 'מ"ל', 'חבילה']
const OTHER_UNIT = 'אחר'

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
  const initialUnit = item?.unit || 'יח\''
  const initialIsCustom = !UNIT_PRESETS.includes(initialUnit)
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
        unit: effectiveUnit || 'יח\'',
        low_threshold: Math.max(0, Number(lowThreshold) || 0)
      })
      onClose()
    } catch (err) {
      const prefix = isEdit ? t('stock:editModal.updateFailedPrefix') : t('stock:editModal.addFailedPrefix')
      const message = String(err?.code || err?.message || '').includes('PERMISSION_DENIED')
        ? t('stock:errors.permissionDenied')
        : err.message
      setError(prefix + message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? t('stock:editModal.titleEdit') : t('stock:editModal.title')}</h2>

        <input
          className="modal-input"
          placeholder={t('stock:editModal.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <select className="modal-input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c.key} value={c.name}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>

        <div className="modal-input-row">
          <label className="modal-input-label">
            {t('stock:editModal.quantity')}
            <input
              className="modal-input"
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label className="modal-input-label">
            {t('stock:editModal.unit')}
            <select className="modal-input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNIT_PRESETS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
              <option value={OTHER_UNIT}>{t('stock:editModal.otherUnit')}</option>
            </select>
          </label>
        </div>

        {unit === OTHER_UNIT && (
          <input
            className="modal-input"
            placeholder={t('stock:editModal.customUnitPlaceholder')}
            value={customUnit}
            onChange={(e) => setCustomUnit(e.target.value)}
          />
        )}

        <label className="modal-input-label">
          {t('stock:editModal.lowThreshold')}
          <input
            className="modal-input"
            type="number"
            min="0"
            value={lowThreshold}
            onChange={(e) => setLowThreshold(e.target.value)}
          />
        </label>

        {isEdit && updatedAt && (
          <div className="modal-meta">
            <div>
              {item.updated_by
                ? t('stock:editModal.updatedAtWithEmail', { date: updatedAt, email: item.updated_by })
                : t('stock:editModal.updatedAt', { date: updatedAt })}
            </div>
          </div>
        )}

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={saving}>
            {t('common:actions.cancel')}
          </button>
          <button className="modal-btn primary" onClick={handleSubmit} disabled={saving}>
            {saving ? t('common:actions.saving') : isEdit ? t('common:actions.save') : t('common:actions.add')}
          </button>
        </div>
      </div>
    </div>
  )
}

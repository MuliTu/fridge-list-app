import { useState } from 'react'
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
      setError('חובה להזין שם פריט')
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
      const prefix = isEdit ? 'עדכון נכשל: ' : 'הוספה נכשלה: '
      const message = String(err?.code || err?.message || '').includes('PERMISSION_DENIED')
        ? 'אין הרשאת כתיבה במסד הנתונים — יש להוסיף את הכלל עבור /stock בקונסולת Firebase (ראה CLAUDE.md).'
        : err.message
      setError(prefix + message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'עריכת פריט מלאי' : 'הוספת פריט למלאי'}</h2>

        <input
          className="modal-input"
          placeholder="שם הפריט"
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
            כמות
            <input
              className="modal-input"
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label className="modal-input-label">
            יחידה
            <select className="modal-input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNIT_PRESETS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
              <option value={OTHER_UNIT}>{OTHER_UNIT}</option>
            </select>
          </label>
        </div>

        {unit === OTHER_UNIT && (
          <input
            className="modal-input"
            placeholder="יחידה מותאמת אישית"
            value={customUnit}
            onChange={(e) => setCustomUnit(e.target.value)}
          />
        )}

        <label className="modal-input-label">
          התראת מלאי נמוך (כמות)
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
              עודכן: {updatedAt} {item.updated_by && `· ${item.updated_by}`}
            </div>
          </div>
        )}

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={saving}>
            ביטול
          </button>
          <button className="modal-btn primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'שומר...' : isEdit ? 'שמירה' : 'הוספה'}
          </button>
        </div>
      </div>
    </div>
  )
}

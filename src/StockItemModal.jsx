import { useState } from 'react'
import { formatDateTime } from './formatDateTime.js'

export default function StockItemModal({ item, categories, onClose, onSubmit }) {
  const isEdit = !!item
  const [name, setName] = useState(item?.name || '')
  const [category, setCategory] = useState(item?.category || categories[0]?.name || '')
  const [quantity, setQuantity] = useState(item?.quantity ?? 1)
  const [unit, setUnit] = useState(item?.unit || 'יח\'')
  const [lowThreshold, setLowThreshold] = useState(item?.low_threshold ?? 1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const updatedAt = isEdit ? formatDateTime(item.updated_at) : null

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('חובה להזין שם פריט')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        category,
        quantity: Math.max(0, Number(quantity) || 0),
        unit: unit.trim() || 'יח\'',
        low_threshold: Math.max(0, Number(lowThreshold) || 0)
      })
      onClose()
    } catch (err) {
      setError((isEdit ? 'עדכון נכשל: ' : 'הוספה נכשלה: ') + err.message)
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
            <input className="modal-input" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </label>
        </div>

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

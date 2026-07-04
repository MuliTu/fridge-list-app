import { useEffect, useState } from 'react'

export default function ReceiptReviewModal({ data, onClose, onSave }) {
  const [previewUrl] = useState(() => URL.createObjectURL(data.imageBlob))
  const [storeName, setStoreName] = useState(data.store_name || '')
  const [items, setItems] = useState(
    (data.items || []).map((i) => ({ name: i.name, price: i.price, quantity: i.quantity || 1 }))
  )
  const [total, setTotal] = useState(data.total ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl])

  const updateItem = (index, field, value) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const addItem = () => {
    setItems((prev) => [...prev, { name: '', price: 0, quantity: 1 }])
  }

  const handleSave = async () => {
    const cleanItems = items
      .map((item) => ({
        name: item.name.trim(),
        price: Math.max(0, Number(item.price) || 0),
        quantity: Math.max(1, Number(item.quantity) || 1)
      }))
      .filter((item) => item.name.length > 0)

    if (cleanItems.length === 0) {
      setError('חובה להזין לפחות פריט אחד')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSave({
        store_name: storeName.trim() || null,
        items: cleanItems,
        total: total === '' ? null : Math.max(0, Number(total) || 0)
      })
    } catch (err) {
      setError('שמירה נכשלה: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>בדיקת קבלה לפני שמירה</h2>

        <img className="modal-image-preview" src={previewUrl} alt="קבלה" />

        <input
          className="modal-input"
          placeholder="שם החנות"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
        />

        <div className="receipt-review-items">
          {items.map((item, i) => (
            <div className="receipt-review-row" key={i}>
              <input
                className="modal-input receipt-review-name"
                placeholder="שם המוצר"
                value={item.name}
                onChange={(e) => updateItem(i, 'name', e.target.value)}
              />
              <input
                className="modal-input receipt-review-qty"
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => updateItem(i, 'quantity', e.target.value)}
              />
              <input
                className="modal-input receipt-review-price"
                type="number"
                min="0"
                step="0.1"
                value={item.price}
                onChange={(e) => updateItem(i, 'price', e.target.value)}
              />
              <button className="stock-icon-btn" onClick={() => removeItem(i)} aria-label="הסרת שורה">
                ✕
              </button>
            </div>
          ))}
        </div>

        <button className="list-pill list-pill-new" onClick={addItem}>
          + הוספת שורה
        </button>

        <label className="modal-input-label">
          סה"כ
          <input
            className="modal-input"
            type="number"
            min="0"
            step="0.1"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </label>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={saving}>
            ביטול
          </button>
          <button className="modal-btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'שומר...' : 'שמירה'}
          </button>
        </div>
      </div>
    </div>
  )
}

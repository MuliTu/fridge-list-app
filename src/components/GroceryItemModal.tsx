import { useState } from 'react'
import type { Category } from '../types'

interface GroceryItemModalProps {
  listName: string | null
  categories: Category[]
  onClose: () => void
  onAdd: (item: { name: string; category: string }) => Promise<unknown> | PromiseLike<unknown>
}

export default function GroceryItemModal({ listName, categories, onClose, onAdd }: GroceryItemModalProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState(categories[0]?.name || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!name.trim()) {
      setError('חובה להזין שם פריט')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onAdd({ name: name.trim(), category })
      onClose()
    } catch (err) {
      setError('הוספה נכשלה: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>הוספת פריט ל"{listName}"</h2>

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

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={saving}>
            ביטול
          </button>
          <button className="modal-btn primary" onClick={handleAdd} disabled={saving}>
            {saving ? 'מוסיף...' : 'הוספה'}
          </button>
        </div>
      </div>
    </div>
  )
}

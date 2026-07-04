import { useState } from 'react'
import { addCategory, deleteCategory, updateCategory } from './firebase.js'

export default function CategoriesModal({ categories, onClose }) {
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('📌')
  const [newColor, setNewColor] = useState('#a8a8a8')
  const [error, setError] = useState(null)

  const handleAdd = async () => {
    if (!newName.trim()) {
      setError('חובה להזין שם קטגוריה')
      return
    }
    setError(null)
    try {
      await addCategory({ name: newName.trim(), icon: newIcon.trim() || '📌', color: newColor })
      setNewName('')
      setNewIcon('📌')
    } catch (err) {
      setError('הוספה נכשלה: ' + err.message)
    }
  }

  const handleDelete = async (cat) => {
    if (!window.confirm(`למחוק את הקטגוריה "${cat.name}"? פריטים קיימים בקטגוריה זו יעברו ל"אחר".`)) return
    try {
      await deleteCategory(cat.key)
    } catch (err) {
      setError('מחיקה נכשלה: ' + err.message)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>ניהול קטגוריות</h2>

        <div className="category-rows">
          {categories.map((cat) => (
            <div className="category-row" key={cat.key}>
              <input
                className="modal-input category-icon-input"
                value={cat.icon || ''}
                onChange={(e) => updateCategory(cat.key, { icon: e.target.value })}
              />
              <input
                className="modal-input"
                value={cat.name}
                disabled={cat.protected}
                onChange={(e) => updateCategory(cat.key, { name: e.target.value })}
              />
              <input
                className="category-color-input"
                type="color"
                value={cat.color}
                onChange={(e) => updateCategory(cat.key, { color: e.target.value })}
              />
              {!cat.protected && (
                <button className="stock-icon-btn" onClick={() => handleDelete(cat)} aria-label="מחיקת קטגוריה">
                  🗑
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="category-row">
          <input
            className="modal-input category-icon-input"
            placeholder="🆕"
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
          />
          <input
            className="modal-input"
            placeholder="שם קטגוריה חדשה"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="category-color-input"
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
          />
          <button className="stock-icon-btn" onClick={handleAdd} aria-label="הוספת קטגוריה">
            ➕
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn primary" onClick={onClose}>
            סגירה
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addCategory, deleteCategory, updateCategory } from '../lib/firebase'
import type { Category } from '../types'

interface CategoriesModalProps {
  categories: Category[]
  onClose: () => void
}

export default function CategoriesModal({ categories, onClose }: CategoriesModalProps) {
  const { t } = useTranslation()
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('📌')
  const [newColor, setNewColor] = useState('#a8a8a8')
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!newName.trim()) {
      setError(t('categories:nameRequired'))
      return
    }
    setError(null)
    try {
      const maxOrder = categories.reduce((max, c) => (typeof c.order === 'number' && c.order > max ? c.order : max), -1)
      await addCategory({ name: newName.trim(), icon: newIcon.trim() || '📌', color: newColor, order: maxOrder + 1 })
      setNewName('')
      setNewIcon('📌')
    } catch (err) {
      setError(`${t('categories:addFailed')}: ${err.message}`)
    }
  }

  const handleDelete = async (cat: Category) => {
    if (!window.confirm(t('categories:deleteConfirm', { categoryName: cat.name }))) return
    try {
      await deleteCategory(cat.key)
    } catch (err) {
      setError(`${t('categories:deleteFailed')}: ${err.message}`)
    }
  }

  const handleMove = async (index: number, direction: 1 | -1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= categories.length) return
    const current = categories[index]
    const neighbor = categories[targetIndex]
    // Categories seeded before this feature existed have no `order` field yet —
    // fall back to their current display position instead of writing `order:
    // undefined`, which the Firebase SDK rejects outright.
    const currentOrder = typeof current.order === 'number' ? current.order : index
    const neighborOrder = typeof neighbor.order === 'number' ? neighbor.order : targetIndex
    try {
      await Promise.all([
        updateCategory(current.key, { order: neighborOrder }),
        updateCategory(neighbor.key, { order: currentOrder })
      ])
    } catch (err) {
      setError(`${t('categories:reorderFailed')}: ${err.message}`)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{t('categories:title')}</h2>

        <div className="category-rows">
          {categories.map((cat, index) => (
            <div className="category-row" key={cat.key}>
              <div className="category-order-btns">
                <button
                  className="stock-icon-btn"
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0}
                  aria-label={t('categories:moveUp')}
                >
                  ▲
                </button>
                <button
                  className="stock-icon-btn"
                  onClick={() => handleMove(index, 1)}
                  disabled={index === categories.length - 1}
                  aria-label={t('categories:moveDown')}
                >
                  ▼
                </button>
              </div>
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
                <button className="stock-icon-btn" onClick={() => handleDelete(cat)} aria-label={t('categories:deleteCategory')}>
                  🗑
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="category-row">
          <input
            className="modal-input category-icon-input"
            placeholder={t('categories:newCategoryIconPlaceholder')}
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
          />
          <input
            className="modal-input"
            placeholder={t('categories:newCategoryNamePlaceholder')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="category-color-input"
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
          />
          <button className="stock-icon-btn" onClick={handleAdd} aria-label={t('categories:addCategory')}>
            ➕
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn primary" onClick={onClose}>
            {t('common:actions.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

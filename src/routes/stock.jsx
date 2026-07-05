import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  addStockItem,
  addStockItemToShoppingList,
  adjustStockQuantity,
  deleteStockItem,
  onValue,
  stockRef,
  updateStockItem
} from '../firebase.js'
import { OTHER_CATEGORY_NAME } from '../categories.js'
import { useCategories } from '../useCategories.js'
import { formatDateTime } from '../formatDateTime.js'
import { useCollapsedSections } from '../useCollapsedSections.js'
import { useAuth } from '../AuthContext.jsx'
import StockItemModal from '../StockItemModal.jsx'

export const Route = createFileRoute('/stock')({
  component: StockPage
})

function StockPage() {
  const { user, canEdit } = useAuth()
  const [entries, setEntries] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const { isCollapsed, toggle } = useCollapsedSections()
  const { categories, categoryMap } = useCategories()

  useEffect(
    () =>
      onValue(stockRef, (snapshot) => {
        const data = snapshot.val() || {}
        setEntries(Object.entries(data).map(([key, entry]) => ({ key, ...entry })))
      }),
    []
  )

  const grouped = {}
  entries.forEach((entry) => {
    const catName = categoryMap.has(entry.category) ? entry.category : OTHER_CATEGORY_NAME
    if (!grouped[catName]) grouped[catName] = []
    grouped[catName].push(entry)
  })
  Object.keys(grouped).forEach((catName) => {
    grouped[catName].sort((a, b) => {
      const aLow = a.quantity <= a.low_threshold
      const bLow = b.quantity <= b.low_threshold
      if (aLow !== bLow) return aLow ? -1 : 1
      return (a.name || '').localeCompare(b.name || '', 'he')
    })
  })

  const visibleCategories = categories.filter((c) => (grouped[c.name] || []).length > 0)
  const isEmpty = visibleCategories.length === 0

  const describeError = (action, err) => {
    const message = String(err?.code || err?.message || '').includes('PERMISSION_DENIED')
      ? 'אין הרשאת כתיבה במסד הנתונים — יש להוסיף את הכלל עבור /stock בקונסולת Firebase (ראה CLAUDE.md).'
      : err.message
    return `${action}: ${message}`
  }

  const handleAdjust = async (entry, delta) => {
    try {
      await adjustStockQuantity(entry.key, entry.quantity + delta, user)
    } catch (err) {
      window.alert(describeError('עדכון כמות נכשל', err))
    }
  }

  const handleDelete = async (entry) => {
    if (!window.confirm(`למחוק את "${entry.name}" מהמלאי?`)) return
    try {
      await deleteStockItem(entry.key)
    } catch (err) {
      window.alert(describeError('מחיקה נכשלה', err))
    }
  }

  const handleAddToShoppingList = (entry) => {
    addStockItemToShoppingList(entry, user)
  }

  return (
    <div className="stock-view">
      {isEmpty ? (
        <div className="all-empty">
          המלאי ריק{canEdit ? ' — הוסיפו פריט ראשון 📦' : ' 📦'}
        </div>
      ) : (
        <div className="board-grid">
          {visibleCategories.map(({ name, color, icon }) => (
            <section className="panel" key={name} style={{ '--accent': color }}>
              <h2 className="panel-header" onClick={() => toggle(name)}>
                <span className="cat-icon">{icon}</span>
                {name}
                <span className={`chevron${isCollapsed(name) ? ' collapsed' : ''}`}>▾</span>
              </h2>
              {!isCollapsed(name) && (
                <ul className="items stock-items">
                  {grouped[name].map((entry) => {
                    const isLow = entry.quantity <= entry.low_threshold
                    return (
                      <li className={`item stock-item${isLow ? ' low-stock' : ''}`} key={entry.key}>
                        <div className="stock-row">
                          <span className="stock-name">{entry.name}</span>
                          <span className="stock-qty">
                            {entry.quantity} {entry.unit}
                          </span>
                        </div>
                        {(entry.updated_by || entry.updated_at) && (
                          <div className="stock-meta">
                            עודכן: {formatDateTime(entry.updated_at)} {entry.updated_by && `· ${entry.updated_by}`}
                          </div>
                        )}
                        <div className="stock-actions">
                          <button
                            className="stepper-btn"
                            disabled={!canEdit}
                            onClick={() => handleAdjust(entry, -1)}
                            aria-label="הפחתה"
                          >
                            −
                          </button>
                          <button
                            className="stepper-btn"
                            disabled={!canEdit}
                            onClick={() => handleAdjust(entry, 1)}
                            aria-label="הוספה"
                          >
                            +
                          </button>
                          {isLow && canEdit && (
                            <button className="add-to-list-btn" onClick={() => handleAddToShoppingList(entry)}>
                              🛒 לרשימה
                            </button>
                          )}
                          {canEdit && (
                            <button
                              className="stock-icon-btn"
                              onClick={() => setEditingItem(entry)}
                              aria-label="עריכה"
                            >
                              ✎
                            </button>
                          )}
                          {canEdit && (
                            <button
                              className="stock-icon-btn stock-delete-btn"
                              onClick={() => handleDelete(entry)}
                              aria-label="מחיקה"
                            >
                              🗑
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {canEdit && (
        <button className="fab-add-btn" onClick={() => setShowAdd(true)} aria-label="הוספת פריט למלאי">
          +
        </button>
      )}

      {(showAdd || editingItem) && (
        <StockItemModal
          item={editingItem}
          categories={categories}
          onClose={() => {
            setShowAdd(false)
            setEditingItem(null)
          }}
          onSubmit={(fields) =>
            editingItem ? updateStockItem(editingItem.key, fields, user) : addStockItem(fields, user)
          }
        />
      )}
    </div>
  )
}

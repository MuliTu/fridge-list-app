import { useState, type CSSProperties } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  addGroceryItem,
  adjustStockQuantity,
  deleteGroceryList,
  deleteItem,
  findStockItemByName,
  saveItemDetails,
  setBought
} from '../lib/firebase'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { useCategories } from '../hooks/useCategories'
import { useCollapsedSections } from '../hooks/useCollapsedSections'
import { formatDateTime } from '../lib/formatDateTime'
import { useAuth } from '../hooks/AuthContext'
import { useGroceriesFeed } from '../hooks/GroceriesFeedContext'
import ItemDetailModal from '../components/ItemDetailModal'
import GroceryItemModal from '../components/GroceryItemModal'
import RestockPrompt from '../components/RestockPrompt'
import type { GroceryItem, StockItem } from '../types'

const PERMANENT_LIST = null

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { list?: string } => ({
    list: typeof search.list === 'string' ? search.list : undefined
  }),
  component: ShoppingListPage
})

function ShoppingListPage() {
  const { list } = Route.useSearch()
  const navigate = Route.useNavigate()
  const activeList = list || PERMANENT_LIST

  const { user, canEdit, onSignIn } = useAuth()
  const { entries: allEntries } = useGroceriesFeed()
  const [selectedEntry, setSelectedEntry] = useState<GroceryItem | null>(null)
  const [restockMatch, setRestockMatch] = useState<StockItem | null>(null)
  const [showAddGrocery, setShowAddGrocery] = useState(false)
  const { isCollapsed, toggle } = useCollapsedSections()
  const { categories, categoryMap } = useCategories()

  const customListNames = new Set(allEntries.map((e) => e.list_name).filter(Boolean) as string[])
  if (activeList) customListNames.add(activeList)
  const sortedCustomLists = [...customListNames].sort((a, b) => a.localeCompare(b, 'he'))

  const visibleEntries = allEntries.filter((e) => (e.list_name || PERMANENT_LIST) === activeList)

  const grouped: Record<string, GroceryItem[]> = {}
  visibleEntries.forEach((entry) => {
    const catName = categoryMap.has(entry.category) ? entry.category : OTHER_CATEGORY_NAME
    if (!grouped[catName]) grouped[catName] = []
    grouped[catName].push(entry)
  })
  Object.keys(grouped).forEach((catName) => {
    grouped[catName].sort((a, b) => {
      if (!!a.bought !== !!b.bought) return a.bought ? 1 : -1
      return (a.added_at || '').localeCompare(b.added_at || '')
    })
  })

  const visibleCategories = categories.filter((c) => (grouped[c.name] || []).length > 0)
  const isEmpty = visibleCategories.length === 0

  const handleToggleBought = (entry: GroceryItem) => {
    const newBought = !entry.bought
    setBought(entry.key, newBought, user)
    if (newBought) {
      findStockItemByName(entry.item)
        .then((match) => {
          if (match) setRestockMatch(match)
        })
        .catch((error) => console.error('[Stock] lookup failed:', error.message))
    }
  }

  const handleItemClick = (entry: GroceryItem) => {
    if (!canEdit) return
    handleToggleBought(entry)
  }

  const handleCreateList = () => {
    const name = window.prompt('שם הרשימה החדשה (למשל: מסיבה)')
    const trimmed = name?.trim()
    if (!trimmed) return
    navigate({ search: { list: trimmed } })
  }

  const handleDeleteList = () => {
    const count = visibleEntries.length
    if (!window.confirm(`למחוק את הרשימה "${activeList}" וכל ${count} הפריטים בה? לא ניתן לשחזר.`)) return
    deleteGroceryList(activeList)
    navigate({ search: { list: undefined } })
  }

  const handleShareMissing = () => {
    const missing = visibleEntries.filter((e) => !e.bought)
    if (missing.length === 0) return
    const lines = missing.map((e) => `• ${e.item}`).join('\n')
    const title = activeList ? `רשימת קניות – ${activeList}` : 'רשימת קניות'
    const text = `${title}:\n${lines}`

    if (navigator.share) {
      navigator.share({ title, text }).catch(() => {})
    } else {
      window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`
    }
  }

  return (
    <>
      <div className="list-picker">
        <button
          className={`list-pill${activeList === PERMANENT_LIST ? ' active' : ''}`}
          onClick={() => navigate({ search: { list: undefined } })}
        >
          הרשימה הקבועה
        </button>
        {sortedCustomLists.map((name) => (
          <button
            key={name}
            className={`list-pill${activeList === name ? ' active' : ''}`}
            onClick={() => navigate({ search: { list: name } })}
          >
            {name}
          </button>
        ))}
        {canEdit && (
          <button className="list-pill list-pill-new" onClick={handleCreateList}>
            + רשימה חדשה
          </button>
        )}
        {canEdit && activeList !== PERMANENT_LIST && (
          <button className="list-delete-btn" onClick={handleDeleteList}>
            🗑 מחיקת הרשימה
          </button>
        )}
        {visibleEntries.some((e) => !e.bought) && (
          <button className="list-pill" onClick={handleShareMissing}>
            📤 שיתוף מה חסר
          </button>
        )}
      </div>

      {isEmpty ? (
        <div className="all-empty">הרשימה ריקה 🎉</div>
      ) : (
        <div className="flat-list">
          {visibleCategories.map(({ name, color, icon }) => (
            <div className="flat-section" key={name} style={{ '--accent': color } as CSSProperties}>
              <h2 className="flat-section-header" onClick={() => toggle(name)}>
                <span className="cat-icon">{icon}</span>
                {name}
                <span className={`chevron${isCollapsed(name) ? ' collapsed' : ''}`}>▾</span>
              </h2>
              {!isCollapsed(name) && (
                <ul className="items">
                  {grouped[name].map((entry) => (
                    <li
                      className={`item${entry.isFresh ? ' fresh' : ''}${entry.bought ? ' bought' : ''}`}
                      key={entry.key}
                      onClick={() => handleItemClick(entry)}
                    >
                      <span className="item-row">
                        <span className="item-top">
                          <span>{entry.item}</span>
                          {entry.note && <span className="item-icon">📝</span>}
                          {entry.image_url && <span className="item-icon">📷</span>}
                          <button
                            className="stock-icon-btn item-info-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedEntry(entry)
                            }}
                            aria-label="פרטי פריט"
                          >
                            ℹ️
                          </button>
                        </span>
                        <span className="item-meta">
                          {entry.bought
                            ? `✓ סומן ע"י ${entry.modified_by || 'Siri'} · ${formatDateTime(entry.modified_at) || ''}`
                            : `נוסף ע"י ${entry.created_by || 'Siri'} · ${formatDateTime(entry.added_at) || ''}`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && activeList !== PERMANENT_LIST && (
        <button className="fab-add-btn" onClick={() => setShowAddGrocery(true)} aria-label="הוספת פריט לרשימה">
          +
        </button>
      )}

      {selectedEntry && (
        <ItemDetailModal
          entry={selectedEntry}
          canEdit={canEdit}
          onSignIn={onSignIn}
          onClose={() => setSelectedEntry(null)}
          onSave={(key, details) => saveItemDetails(key, details, user)}
          onDelete={(key) => deleteItem(key, selectedEntry.image_url)}
        />
      )}

      {restockMatch && (
        <RestockPrompt
          item={restockMatch}
          onDismiss={() => setRestockMatch(null)}
          onConfirm={(amount) => {
            adjustStockQuantity(restockMatch.key, restockMatch.quantity + amount, user)
            setRestockMatch(null)
          }}
        />
      )}

      {showAddGrocery && (
        <GroceryItemModal
          listName={activeList}
          categories={categories}
          onClose={() => setShowAddGrocery(false)}
          onAdd={(item) => addGroceryItem(item, activeList, user)}
        />
      )}
    </>
  )
}

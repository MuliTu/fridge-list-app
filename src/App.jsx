import { useEffect, useRef, useState } from 'react'
import {
  addGroceryItem,
  adjustStockQuantity,
  deleteGroceryList,
  deleteItem,
  findStockItemByName,
  groceriesRef,
  onValue,
  saveItemDetails,
  setBought
} from './firebase.js'
import { OTHER_CATEGORY_NAME } from './categories.js'
import { useCategories } from './useCategories.js'
import { useCollapsedSections } from './useCollapsedSections.js'
import { formatDateTime } from './formatDateTime.js'
import ItemDetailModal from './ItemDetailModal.jsx'
import GroceryItemModal from './GroceryItemModal.jsx'
import StockView from './StockView.jsx'
import ReceiptsView from './ReceiptsView.jsx'
import RestockPrompt from './RestockPrompt.jsx'
import CategoriesModal from './CategoriesModal.jsx'
import AdminsModal from './AdminsModal.jsx'

const PERMANENT_LIST = null

export default function App({ user, canEdit, onSignIn, onSignOut, authError }) {
  const [tab, setTab] = useState('list')
  const [allEntries, setAllEntries] = useState([])
  const [activeList, setActiveList] = useState(PERMANENT_LIST)
  const [status, setStatus] = useState('מתחבר...')
  const [toast, setToast] = useState(null)
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [restockMatch, setRestockMatch] = useState(null)
  const [showAddGrocery, setShowAddGrocery] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [showAdmins, setShowAdmins] = useState(false)
  const knownKeys = useRef(new Set())
  const firstLoad = useRef(true)
  const toastTimer = useRef(null)
  const longPressTimer = useRef(null)
  const longPressFired = useRef(false)
  const { isCollapsed, toggle } = useCollapsedSections()
  const { categories, categoryMap } = useCategories()

  useEffect(() => {
    const unsubscribe = onValue(
      groceriesRef,
      (snapshot) => {
        const data = snapshot.val() || {}
        const newlyAdded = []

        const entries = Object.entries(data).map(([key, entry]) => {
          const isFresh = !firstLoad.current && !knownKeys.current.has(key)
          if (isFresh) newlyAdded.push(entry.item)
          return { key, ...entry, isFresh }
        })

        knownKeys.current = new Set(Object.keys(data))

        if (newlyAdded.length > 0 && !firstLoad.current) {
          const message =
            newlyAdded.length === 1
              ? `נוסף: ${newlyAdded[0]}`
              : `נוספו ${newlyAdded.length} פריטים: ${newlyAdded.join(', ')}`
          setToast(message)
          if (toastTimer.current) clearTimeout(toastTimer.current)
          toastTimer.current = setTimeout(() => setToast(null), 4500)
        }

        firstLoad.current = false
        setAllEntries(entries)
        setStatus('עודכן לאחרונה: ' + new Date().toLocaleTimeString('he-IL'))
      },
      (error) => {
        setStatus('שגיאת חיבור: ' + error.message)
      }
    )

    return () => {
      unsubscribe()
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  const customListNames = new Set(allEntries.map((e) => e.list_name).filter(Boolean))
  if (activeList) customListNames.add(activeList)
  const sortedCustomLists = [...customListNames].sort((a, b) => a.localeCompare(b, 'he'))

  const visibleEntries = allEntries.filter((e) => (e.list_name || PERMANENT_LIST) === activeList)

  const grouped = {}
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

  const handleToggleBought = (entry) => {
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

  const handlePressStart = (entry) => {
    if (!canEdit) return
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      handleToggleBought(entry)
    }, 500)
  }

  const handlePressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleItemClick = (entry) => {
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    setSelectedEntry(entry)
  }

  const handleCreateList = () => {
    const name = window.prompt('שם הרשימה החדשה (למשל: מסיבה)')
    const trimmed = name?.trim()
    if (!trimmed) return
    setActiveList(trimmed)
  }

  const handleDeleteList = () => {
    const count = visibleEntries.length
    if (!window.confirm(`למחוק את הרשימה "${activeList}" וכל ${count} הפריטים בה? לא ניתן לשחזר.`)) return
    deleteGroceryList(activeList)
    setActiveList(PERMANENT_LIST)
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
    <div className="frame">
      <header>
        <div className="user-chip">
          {user ? (
            <>
              {canEdit && (
                <>
                  <button className="icon-btn" onClick={() => setShowCategories(true)} aria-label="ניהול קטגוריות">
                    🗂
                  </button>
                  <button className="icon-btn" onClick={() => setShowAdmins(true)} aria-label="שיתוף עריכה">
                    👥
                  </button>
                </>
              )}
              <span>
                {user.displayName || user.email}
                {!canEdit && ' · צפייה בלבד'}
              </span>
              <button className="signout-btn" onClick={onSignOut}>
                התנתקות
              </button>
            </>
          ) : (
            <button className="signout-btn" onClick={onSignIn}>
              התחברות לעריכה
            </button>
          )}
        </div>
        {authError && <div className="header-error">שגיאת התחברות: {authError}</div>}
        <h1>🛒 רשימת הבית</h1>
        <div className="sub">מתעדכן בזמן אמת</div>
        <div className="tabs">
          <button className={`tab-btn${tab === 'list' ? ' active' : ''}`} onClick={() => setTab('list')}>
            🛒 רשימת קניות
          </button>
          <button className={`tab-btn${tab === 'stock' ? ' active' : ''}`} onClick={() => setTab('stock')}>
            📦 מלאי
          </button>
          <button className={`tab-btn${tab === 'receipts' ? ' active' : ''}`} onClick={() => setTab('receipts')}>
            🧾 קבלות
          </button>
        </div>
        {tab === 'list' && (
          <div className="list-picker">
            <button
              className={`list-pill${activeList === PERMANENT_LIST ? ' active' : ''}`}
              onClick={() => setActiveList(PERMANENT_LIST)}
            >
              הרשימה הקבועה
            </button>
            {sortedCustomLists.map((name) => (
              <button
                key={name}
                className={`list-pill${activeList === name ? ' active' : ''}`}
                onClick={() => setActiveList(name)}
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
        )}
      </header>

      {toast && <div className="toast">🛒 {toast}</div>}

      {tab === 'list' ? (
        isEmpty ? (
          <div className="all-empty">הרשימה ריקה 🎉</div>
        ) : (
          <div className="flat-list">
            {visibleCategories.map(({ name, color, icon }) => (
              <div className="flat-section" key={name} style={{ '--accent': color }}>
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
                        onPointerDown={() => handlePressStart(entry)}
                        onPointerUp={handlePressEnd}
                        onPointerLeave={handlePressEnd}
                      >
                        <span className="item-row">
                          <span className="item-top">
                            <span>{entry.item}</span>
                            {entry.note && <span className="item-icon">📝</span>}
                            {entry.image_url && <span className="item-icon">📷</span>}
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
        )
      ) : tab === 'stock' ? (
        <StockView canEdit={canEdit} user={user} />
      ) : (
        <ReceiptsView canEdit={canEdit} user={user} />
      )}

      {canEdit && tab === 'list' && activeList !== PERMANENT_LIST && (
        <button className="fab-add-btn" onClick={() => setShowAddGrocery(true)} aria-label="הוספת פריט לרשימה">
          +
        </button>
      )}

      <div className="status">{status}</div>

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

      {showCategories && <CategoriesModal categories={categories} onClose={() => setShowCategories(false)} />}

      {showAdmins && <AdminsModal onClose={() => setShowAdmins(false)} />}
    </div>
  )
}

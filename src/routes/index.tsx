import { useState } from 'react'
import type { DragEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  addGroceryItem,
  adjustStockQuantity,
  deleteGroceryList,
  deleteItem,
  findStockItemByName,
  saveItemDetails,
  setBought,
  updateGroceryItemCategory
} from '../lib/firebase'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { useCategories } from '../hooks/useCategories'
import { useCollapsedSections } from '../hooks/useCollapsedSections'
import { useShowPurchased } from '../hooks/useShowPurchased'
import { useAuth } from '../hooks/AuthContext'
import { useGroceriesFeed } from '../hooks/GroceriesFeedContext'
import { useDialogService } from '../hooks/DialogServiceContext'
import ItemDetailModal from '../components/ItemDetailModal'
import GroceryItemModal from '../components/GroceryItemModal'
import BulkUploadModal from '../components/BulkUploadModal'
import RestockPrompt from '../components/RestockPrompt'
import ListPicker from '../components/ListPicker'
import ShoppingListItemRow from '../components/ShoppingListItemRow'
import CategorySection from '../components/CategorySection'
import ListSkeleton from '../components/ListSkeleton'
import type { GroceryItem, StockItem } from '../types'

const PERMANENT_LIST = null

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { list?: string } => ({
    list: typeof search.list === 'string' ? search.list : undefined
  }),
  component: ShoppingListPage
})

function ShoppingListPage() {
  const { t } = useTranslation()
  const { list } = Route.useSearch()
  const navigate = Route.useNavigate()
  const activeList = list || PERMANENT_LIST

  const { user, canEdit, onSignIn } = useAuth()
  const { entries: allEntries, isLoading } = useGroceriesFeed()
  const { confirm, prompt } = useDialogService()
  const [selectedEntry, setSelectedEntry] = useState<GroceryItem | null>(null)
  const [restockMatch, setRestockMatch] = useState<StockItem | null>(null)
  const [showAddGrocery, setShowAddGrocery] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  const { isCollapsed, toggle } = useCollapsedSections()
  const { showPurchased, toggle: toggleShowPurchased } = useShowPurchased(activeList || '__permanent__')
  const { categories, categoryMap } = useCategories()

  const customListNames = new Set(allEntries.map((e) => e.list_name).filter(Boolean) as string[])
  if (activeList) customListNames.add(activeList)
  const sortedCustomLists = [...customListNames].sort((a, b) => a.localeCompare(b, 'he'))

  const visibleEntries = allEntries.filter((e) => (e.list_name || PERMANENT_LIST) === activeList)

  // Hide purchased (bought) items by default so the list stays focused on what's left
  // to buy; the toggle below reveals them (still visually distinguished via `.bought`).
  const purchasedCount = visibleEntries.filter((e) => e.bought).length
  const displayEntries = showPurchased ? visibleEntries : visibleEntries.filter((e) => !e.bought)

  const grouped: Record<string, GroceryItem[]> = {}
  displayEntries.forEach((entry) => {
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

  // Drag-and-drop re-categorization (desktop/tablet, native HTML5 DnD). The item's
  // effective category is what it's grouped under (its own category if still valid,
  // else the "אחר" fallback), so dropping back onto that same section is a no-op.
  const effectiveCategory = (entry: GroceryItem) =>
    categoryMap.has(entry.category) ? entry.category : OTHER_CATEGORY_NAME

  const handleDragStart = (entry: GroceryItem) => (e: DragEvent<HTMLLIElement>) => {
    e.dataTransfer.setData('text/plain', entry.key)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingKey(entry.key)
  }

  const handleDragEnd = () => {
    setDraggingKey(null)
    setDragOverCategory(null)
  }

  const handleDragOverCategory = (catName: string) => (e: DragEvent<HTMLDivElement>) => {
    if (!draggingKey) return
    e.preventDefault() // allow drop
    e.dataTransfer.dropEffect = 'move'
    if (dragOverCategory !== catName) setDragOverCategory(catName)
  }

  const handleDragLeaveCategory = (catName: string) => (e: DragEvent<HTMLDivElement>) => {
    // Ignore leave events fired while moving between child nodes of the same section.
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDragOverCategory((prev) => (prev === catName ? null : prev))
  }

  const handleDropOnCategory = (catName: string) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const key = e.dataTransfer.getData('text/plain') || draggingKey
    setDraggingKey(null)
    setDragOverCategory(null)
    if (!canEdit || !key) return
    const entry = allEntries.find((x) => x.key === key)
    if (!entry) return // item deleted mid-drag — fail gracefully, no write
    if (effectiveCategory(entry) === catName) return // dropped on same category — no-op
    if (isCollapsed(catName)) toggle(catName) // auto-expand target so the moved item is visible
    updateGroceryItemCategory(key, catName, user)
  }

  const handleCreateList = async () => {
    const name = await prompt(t('shoppingList:newListPrompt'))
    const trimmed = name?.trim()
    if (!trimmed) return
    navigate({ search: { list: trimmed } })
  }

  const handleDeleteList = async () => {
    const count = visibleEntries.length
    if (!(await confirm(t('shoppingList:deleteListConfirm', { listName: activeList, count })))) return
    deleteGroceryList(activeList)
    navigate({ search: { list: undefined } })
  }

  const handleShareMissing = () => {
    const missing = visibleEntries.filter((e) => !e.bought)
    if (missing.length === 0) return
    const lines = missing.map((e) => t('shoppingList:share.itemLine', { item: e.item })).join('\n')
    const title = activeList
      ? t('shoppingList:share.customTitle', { listName: activeList })
      : t('shoppingList:share.permanentTitle')
    const text = `${title}:\n${lines}`

    if (navigator.share) {
      navigator.share({ title, text }).catch(() => {})
    } else {
      window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`
    }
  }

  return (
    <>
      <ListPicker
        activeList={activeList}
        customLists={sortedCustomLists}
        canEdit={canEdit}
        hasUnbought={visibleEntries.some((e) => !e.bought)}
        onSelectList={(l) => navigate({ search: { list: l || undefined } })}
        onCreateList={handleCreateList}
        onDeleteList={handleDeleteList}
        onShareMissing={handleShareMissing}
        onBulkUpload={() => setShowBulkUpload(true)}
      />

      {isLoading && isEmpty ? (
        <ListSkeleton variant="flat" sections={3} rows={3} />
      ) : (
        <>
          {purchasedCount > 0 && (
            <div className="purchased-toggle-row">
              <button className="list-pill purchased-toggle-btn" onClick={toggleShowPurchased}>
                {showPurchased
                  ? t('shoppingList:purchased.hide')
                  : t('shoppingList:purchased.show', { count: purchasedCount })}
              </button>
            </div>
          )}
          {isEmpty ? (
            <div className="all-empty">
              {purchasedCount > 0 ? t('shoppingList:purchased.allPurchased') : t('shoppingList:empty')}
            </div>
          ) : (
            <div className="flat-list">
              {visibleCategories.map(({ name, color, icon }) => (
            <CategorySection
              key={name}
              name={name}
              color={color}
              icon={icon}
              collapsed={isCollapsed(name)}
              onToggle={() => toggle(name)}
              dragOver={dragOverCategory === name}
              onDragOver={canEdit ? handleDragOverCategory(name) : undefined}
              onDragLeave={canEdit ? handleDragLeaveCategory(name) : undefined}
              onDrop={canEdit ? handleDropOnCategory(name) : undefined}
            >
              {grouped[name].map((entry) => (
                <ShoppingListItemRow
                  key={entry.key}
                  entry={entry}
                  draggable={canEdit}
                  dragging={draggingKey === entry.key}
                  onDragStart={handleDragStart(entry)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleItemClick(entry)}
                  onInfoClick={() => setSelectedEntry(entry)}
                />
              ))}
            </CategorySection>
              ))}
            </div>
          )}
        </>
      )}

      {canEdit && activeList !== PERMANENT_LIST && (
        <button className="fab-add-btn" onClick={() => setShowAddGrocery(true)} aria-label={t('shoppingList:addItemFab')}>
          +
        </button>
      )}

      {selectedEntry && (
        <ItemDetailModal
          entry={selectedEntry}
          canEdit={canEdit}
          categories={categories}
          onSignIn={onSignIn}
          onClose={() => setSelectedEntry(null)}
          onSave={(key, details) => saveItemDetails(key, details, user)}
          onDelete={(key) => deleteItem(key, selectedEntry.image_ref)}
          onMoveCategory={(key, category) => updateGroceryItemCategory(key, category, user)}
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
          onClose={() => setShowAddGrocery(false)}
          onAdd={(item) => addGroceryItem(item, activeList, user)}
        />
      )}

      {showBulkUpload && (
        <BulkUploadModal
          listName={activeList}
          categories={categories}
          onClose={() => setShowBulkUpload(false)}
          onAdd={(item) => addGroceryItem(item, activeList, user)}
        />
      )}
    </>
  )
}

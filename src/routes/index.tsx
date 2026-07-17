import { useEffect, useState } from 'react'
import type { DragEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { StockUnit } from '../lib/units'
import { useCategories } from '../hooks/useCategories'
import { useCollapsedSections } from '../hooks/useCollapsedSections'
import { useShowPurchased } from '../hooks/useShowPurchased'
import { useListSort } from '../hooks/useListSort'
import { isStockSuggestionEnabled } from '../hooks/useStockSuggestion'
import { useAuth } from '../hooks/AuthContext'
import { useActiveList, useListApi } from '../hooks/ListContext'
import { useGroceriesFeed } from '../hooks/GroceriesFeedContext'
import { useListPickerActions } from '../hooks/ListPickerActionsContext'
import { useDialogService } from '../hooks/DialogServiceContext'
import ItemDetailModal from '../components/ItemDetailModal'
import GroceryItemModal from '../components/GroceryItemModal'
import BulkUploadModal from '../components/BulkUploadModal'
import RestockPrompt from '../components/RestockPrompt'
import ListPicker from '../components/ListPicker'
import ActiveListLabel from '../components/ActiveListLabel'
import ShoppingListSearch from '../components/ShoppingListSearch'
import SearchSuggestAdd from '../components/SearchSuggestAdd'
import ShoppingListSort from '../components/ShoppingListSort'
import ShoppingListItemRow from '../components/ShoppingListItemRow'
import CategorySection from '../components/CategorySection'
import ListSkeleton from '../components/ListSkeleton'
import { sortGroceryItems } from '../lib/sortGroceryItems'
import type { GroceryItem, StockItem } from '../types'

const PERMANENT_LIST = null

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { list?: string } => ({
    list: typeof search.list === 'string' ? search.list : undefined
  }),
  component: ShoppingListPage
})

function ShoppingListPage() {
  const { t, i18n } = useTranslation()
  const { list } = Route.useSearch()
  const navigate = Route.useNavigate()
  const activeList = list || PERMANENT_LIST

  const { user, onSignIn } = useAuth()
  const { canEdit } = useActiveList()
  const listApi = useListApi()
  const { entries: allEntries, isLoading } = useGroceriesFeed()
  const { confirm, prompt } = useDialogService()
  const [selectedEntry, setSelectedEntry] = useState<GroceryItem | null>(null)
  const [restockTarget, setRestockTarget] = useState<{ entry: GroceryItem; existing: StockItem | null } | null>(null)
  const [showAddGrocery, setShowAddGrocery] = useState(false)
  // Set only when the add-item modal is opened from the search's "no results,
  // add it?" prompt (SearchSuggestAdd) — pre-fills GroceryItemModal's name field.
  // Cleared whenever the modal opens/closes any other way so a stale value never
  // leaks into a later FAB-triggered add.
  const [addModalInitialName, setAddModalInitialName] = useState<string | undefined>(undefined)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  // Ephemeral, client-only search filter. Not persisted (no localStorage, no URL param)
  // so it resets when navigating away and back — the ticket explicitly wants this.
  const [search, setSearch] = useState('')
  const { isCollapsed, toggle } = useCollapsedSections()
  const { showPurchased, toggle: toggleShowPurchased } = useShowPurchased(activeList || '__permanent__')
  const { sortOption, setSortOption } = useListSort(activeList || '__permanent__', user?.email)
  const { categories, categoryMap } = useCategories()

  const customListNames = new Set(allEntries.map((e) => e.list_name).filter(Boolean) as string[])
  if (activeList) customListNames.add(activeList)
  const sortedCustomLists = [...customListNames].sort((a, b) => a.localeCompare(b, 'he'))

  const visibleEntries = allEntries.filter((e) => (e.list_name || PERMANENT_LIST) === activeList)

  // Hide purchased (bought) items by default so the list stays focused on what's left
  // to buy; the toggle below reveals them (still visually distinguished via `.bought`).
  const purchasedCount = visibleEntries.filter((e) => e.bought).length
  const displayEntries = showPurchased ? visibleEntries : visibleEntries.filter((e) => !e.bought)

  // Client-side name search: case-insensitive substring match on the item name, layered
  // on top of the existing hide-purchased filter so the two coexist. Empty query = no-op.
  const query = search.trim().toLowerCase()
  const searchedEntries = query
    ? displayEntries.filter((e) => (e.item || '').toLowerCase().includes(query))
    : displayEntries

  const grouped: Record<string, GroceryItem[]> = {}
  searchedEntries.forEach((entry) => {
    const catName = categoryMap.has(entry.category) ? entry.category : OTHER_CATEGORY_NAME
    if (!grouped[catName]) grouped[catName] = []
    grouped[catName].push(entry)
  })
  Object.keys(grouped).forEach((catName) => {
    grouped[catName] = sortGroceryItems(grouped[catName], sortOption, i18n.language)
  })

  const visibleCategories = categories.filter((c) => (grouped[c.name] || []).length > 0)
  const isEmpty = visibleCategories.length === 0

  const handleToggleBought = (entry: GroceryItem) => {
    const newBought = !entry.bought
    listApi.setBought(entry.key, newBought, user)
    // Offer to reflect the purchase in the home inventory. Unlike before, the prompt
    // now appears whether or not the item is already tracked in /stock: an existing
    // match adds to its quantity, a miss offers to create a fresh stock entry. Gated by
    // the settings toggle (isStockSuggestionEnabled), read fresh so it reflects the
    // latest choice.
    if (newBought && isStockSuggestionEnabled()) {
      listApi.findStockItemByName(entry.item)
        .then((match) => setRestockTarget({ entry, existing: match }))
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
    listApi.updateGroceryItemCategory(key, catName, user)
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
    listApi.deleteGroceryList(activeList)
    navigate({ search: { list: undefined } })
  }

  const handleSuggestAdd = () => {
    setAddModalInitialName(search.trim())
    setShowAddGrocery(true)
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

  // List management actions (new/import/delete/share-missing) render in the
  // sidebar now, not on this page — Layout.tsx can't reach this route's local
  // state directly, so this registers the current handlers into a shared slot
  // it reads from. Cleared on unmount so navigating to /stock or /receipts hides
  // this section instead of leaving stale actions behind.
  const { setActions: setListPickerActions } = useListPickerActions()
  useEffect(() => {
    setListPickerActions({
      canEdit,
      isCustomList: activeList !== PERMANENT_LIST,
      hasUnbought: visibleEntries.some((e) => !e.bought),
      onCreateList: handleCreateList,
      onDeleteList: handleDeleteList,
      onShareMissing: handleShareMissing,
      onBulkUpload: () => setShowBulkUpload(true)
    })
    return () => setListPickerActions(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over
    // activeList/visibleEntries/canEdit already listed below; re-registering on
    // every render would be harmless but pointless churn through the context.
  }, [activeList, canEdit, visibleEntries.length])

  return (
    <>
      {/* Nothing to switch between when there are no custom lists yet — showing a
          single non-interactive-feeling "permanent list" pill in that case is
          pure clutter on a page meant to be glanced at quickly while shopping. */}
      {sortedCustomLists.length > 0 && (
        <ListPicker
          activeList={activeList}
          customLists={sortedCustomLists}
          onSelectList={(l) => navigate({ search: { list: l || undefined } })}
        />
      )}

      {/* Unconditional (unlike the pills above, which only render once a custom list
          exists) — this is the glanceable "which list is this" indicator, so it needs
          to show for the permanent list too, not just when there's something to
          switch between. See ActiveListLabel.tsx for the full reasoning. */}
      <ActiveListLabel activeList={activeList} />

      {visibleEntries.length > 0 && (
        <div className="list-controls-row">
          <ShoppingListSearch value={search} onChange={setSearch} />
          <ShoppingListSort value={sortOption} onChange={setSortOption} />
          {purchasedCount > 0 && (
            <button className="list-pill purchased-toggle-btn" onClick={toggleShowPurchased}>
              {showPurchased
                ? t('shoppingList:purchased.hide')
                : t('shoppingList:purchased.show', { count: purchasedCount })}
            </button>
          )}
        </div>
      )}

      {isLoading && isEmpty ? (
        <ListSkeleton variant="flat" sections={3} rows={3} />
      ) : (
        <>
          {isEmpty ? (
            query && canEdit ? (
              <SearchSuggestAdd query={search.trim()} onSuggestAdd={handleSuggestAdd} />
            ) : (
              <div className="all-empty">
                {query
                  ? t('shoppingList:search.noResults', { query: search.trim() })
                  : purchasedCount > 0
                    ? t('shoppingList:purchased.allPurchased')
                    : t('shoppingList:empty')}
              </div>
            )
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

      {canEdit && (
        <button
          className="fab-add-btn"
          onClick={() => {
            setAddModalInitialName(undefined)
            setShowAddGrocery(true)
          }}
          aria-label={t('shoppingList:addItemFab')}
        >
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
          onSave={(key, details) => listApi.saveItemDetails(key, details, user)}
          onDelete={(key) => listApi.deleteItem(key, selectedEntry.image_ref)}
          onMoveCategory={(key, category) => listApi.updateGroceryItemCategory(key, category, user)}
        />
      )}

      {restockTarget && (
        <RestockPrompt
          itemName={restockTarget.entry.item}
          existing={restockTarget.existing}
          onDismiss={() => setRestockTarget(null)}
          onConfirm={(amount) => {
            const { entry, existing } = restockTarget
            if (existing) {
              listApi.adjustStockQuantity(existing.key, existing.quantity + amount, user)
            } else {
              const category = categoryMap.has(entry.category) ? entry.category : OTHER_CATEGORY_NAME
              listApi.addStockItem(
                { name: entry.item, category, quantity: amount, unit: StockUnit.Piece, low_threshold: 1 },
                user
              )
            }
            setRestockTarget(null)
          }}
        />
      )}

      {showAddGrocery && (
        <GroceryItemModal
          listName={activeList}
          initialName={addModalInitialName}
          onClose={() => {
            setShowAddGrocery(false)
            setAddModalInitialName(undefined)
          }}
          onAdd={(item) => listApi.addGroceryItem(item, activeList, user)}
        />
      )}

      {showBulkUpload && (
        <BulkUploadModal
          listName={activeList}
          categories={categories}
          existingItemNames={visibleEntries.filter((e) => !e.bought).map((e) => e.item)}
          onClose={() => setShowBulkUpload(false)}
          onAdd={(item) => listApi.addGroceryItem(item, activeList, user)}
        />
      )}
    </>
  )
}

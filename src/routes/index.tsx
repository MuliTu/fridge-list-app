import { useContext, useEffect, useRef, useState } from 'react'
import { useBehaviorSettings } from '../hooks/BehaviorSettingsContext'
import { LocalCategoriesContext } from '../hooks/LocalCategoriesContext'
import type { DragEvent } from 'react'
import {
  ArrowUpRight,
  Check,
  CookingPot,
  ShoppingBasket,
  Plus,
  Share2,
  SlidersHorizontal
} from 'lucide-react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { normalizeName } from '../lib/normalizeName'
import { categorizeItem } from '../lib/firebase'
import { isChefFoodProduct } from '../lib/chefProducts'
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
import { useBoughtItemsPreference } from '../hooks/BoughtItemsPreferenceContext'
import ItemDetailModal from '../components/ItemDetailModal'
import GroceryItemModal from '../components/GroceryItemModal'
import BulkUploadModal from '../components/BulkUploadModal'
import RestockPrompt from '../components/RestockPrompt'
import ListPicker from '../components/ListPicker'
import ShoppingListSearch from '../components/ShoppingListSearch'
import SearchSuggestAdd from '../components/SearchSuggestAdd'
import ShoppingListSort from '../components/ShoppingListSort'
import ShoppingListItemRow from '../components/ShoppingListItemRow'
import CategorySection from '../components/CategorySection'
import QuickAddBar from '../components/QuickAddBar'
import ListSkeleton from '../components/ListSkeleton'
import { sortGroceryItems } from '../lib/sortGroceryItems'
import { partitionGroceryItemsByPlacement } from '../lib/boughtItemsPlacement'
import type { GroceryItem, StockItem } from '../types'

const PERMANENT_LIST = null

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { list?: string } => ({
    list: typeof search.list === 'string' ? search.list : undefined
  }),
  component: ShoppingListPage
})

function ShoppingListPage() {
  const { settings: behavior } = useBehaviorSettings()
  const localMock = useContext(LocalCategoriesContext) !== null
  const { t, i18n } = useTranslation()
  const { list } = Route.useSearch()
  const navigate = Route.useNavigate()
  const activeList = list || PERMANENT_LIST

  const { user, onSignIn } = useAuth()
  const { canEdit } = useActiveList()
  const listApi = useListApi()
  const { entries: allEntries, isLoading } = useGroceriesFeed()
  const { confirm, prompt, alert } = useDialogService()
  const [selectedEntry, setSelectedEntry] = useState<GroceryItem | null>(null)
  const [restockTarget, setRestockTarget] = useState<{
    entry: GroceryItem
    existing: StockItem | null
  } | null>(null)
  const [showAddGrocery, setShowAddGrocery] = useState(false)
  // Set only when the add-item modal is opened from the search's "no results,
  // add it?" prompt (SearchSuggestAdd) — pre-fills GroceryItemModal's name field.
  // Cleared whenever the modal opens/closes any other way so a stale value never
  // leaks into a later FAB-triggered add.
  const [addModalInitialName, setAddModalInitialName] = useState<string | undefined>(undefined)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const quickAddInputRef = useRef<HTMLInputElement>(null)
  const pendingItemNamesRef = useRef(new Set<string>())
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  // Ephemeral, client-only search filter. Not persisted (no localStorage, no URL param)
  // so it resets when navigating away and back — the ticket explicitly wants this.
  const [search, setSearch] = useState('')
  const { isCollapsed, toggle } = useCollapsedSections('shoppingCollapsedCategories')
  const { showPurchased, toggle: toggleShowPurchased } = useShowPurchased(
    activeList || '__permanent__'
  )
  const { sortOption, setSortOption } = useListSort(activeList || '__permanent__', user?.email)
  const { categories, categoryMap } = useCategories()
  const { keepBoughtItemsInCategories } = useBoughtItemsPreference()

  const customListNames = new Set(allEntries.map((e) => e.list_name).filter(Boolean) as string[])
  if (activeList) customListNames.add(activeList)
  const sortedCustomLists = [...customListNames].sort((a, b) => a.localeCompare(b, 'he'))

  const visibleEntries = allEntries.filter((e) => (e.list_name || PERMANENT_LIST) === activeList)
  const uncheckedCountByCategory = visibleEntries.reduce<Record<string, number>>(
    (counts, entry) => {
      if (entry.bought) return counts
      const category = categoryMap.has(entry.category) ? entry.category : OTHER_CATEGORY_NAME
      counts[category] = (counts[category] || 0) + 1
      return counts
    },
    {}
  )
  const chefAvailableProducts = visibleEntries.filter(
    (entry) => entry.bought && isChefFoodProduct(entry)
  )

  useEffect(() => {
    for (const entry of visibleEntries) {
      if (!entry.bought) {
        pendingItemNamesRef.current.delete(
          `${activeList ?? '__permanent__'}::${normalizeName(entry.item)}`
        )
      }
    }
  }, [activeList, visibleEntries])

  const addGroceryItemUnlessActiveDuplicate = async (item: {
    name: string
    category: string
    note?: string | null
    quantity?: number | null
    unit?: string | null
  }) => {
    const normalized = normalizeName(item.name)
    const reservationKey = `${activeList ?? '__permanent__'}::${normalized}`
    const alreadyActive = visibleEntries.some(
      (entry) => !entry.bought && normalizeName(entry.item) === normalized
    )
    if (alreadyActive || pendingItemNamesRef.current.has(reservationKey)) return
    pendingItemNamesRef.current.add(reservationKey)
    try {
      await listApi.addGroceryItem(item, activeList, user)
    } catch (error) {
      pendingItemNamesRef.current.delete(reservationKey)
      throw error
    }
  }

  const purchasedCount = visibleEntries.filter((e) => e.bought).length
  const { categoryEntries, completedEntries } = partitionGroceryItemsByPlacement(
    visibleEntries,
    keepBoughtItemsInCategories
  )

  // Client-side name search: case-insensitive substring match on the item name, layered
  // on top of the selected bought-item placement. Empty query = no-op.
  const query = search.trim().toLowerCase()
  const matchesSearch = (entry: GroceryItem) =>
    !query || (entry.item || '').toLowerCase().includes(query)
  const searchedEntries = categoryEntries.filter(matchesSearch)
  const searchedPurchasedEntries = sortGroceryItems(
    completedEntries.filter(matchesSearch),
    sortOption,
    i18n.language
  )

  const urgentEntries = behavior.showUrgent
    ? sortGroceryItems(searchedEntries.filter(entry => !entry.bought && entry.urgency === 'urgent'), sortOption, i18n.language)
    : []
  const urgentKeys = new Set(urgentEntries.map(entry => entry.key))
  const mainEntries = searchedEntries.filter(entry => !urgentKeys.has(entry.key))

  const grouped: Record<string, GroceryItem[]> = {}
  mainEntries.forEach((entry) => {
    const catName = categoryMap.has(entry.category) ? entry.category : OTHER_CATEGORY_NAME
    if (!grouped[catName]) grouped[catName] = []
    grouped[catName].push(entry)
  })
  Object.keys(grouped).forEach((catName) => {
    grouped[catName] = sortGroceryItems(grouped[catName], sortOption, i18n.language)
  })

  const visibleCategories = categories.filter((c) => (grouped[c.name] || []).length > 0)
  const activeResultsEmpty = searchedEntries.length === 0
  const allResultsEmpty = activeResultsEmpty && searchedPurchasedEntries.length === 0

  const handleToggleBought = async (entry: GroceryItem) => {
    const newBought = !entry.bought
    try {
      await listApi.setBought(entry, newBought, user)
    } catch {
      await alert(t('itemDetail.saveFailed'))
      return
    }
    // Offer to reflect the purchase in the home inventory. Unlike before, the prompt
    // now appears whether or not the item is already tracked in /stock: an existing
    // match adds to its quantity, a miss offers to create a fresh stock entry. Gated by
    // the settings toggle (isStockSuggestionEnabled), read fresh so it reflects the
    // latest choice.
    if (newBought && isStockSuggestionEnabled()) {
      listApi
        .findStockItemByName(entry.item)
        .then((match) => setRestockTarget({ entry, existing: match }))
        .catch((error) => console.error('[Stock] lookup failed:', error.message))
    }
  }

  const handleItemCheckedChange = (entry: GroceryItem) => {
    if (!canEdit) return
    handleToggleBought(entry)
  }

  const handleQuickAdd = async (name: string, aiCategory?: string) => {
    if (localMock) {
      await addGroceryItemUnlessActiveDuplicate({ name, category: aiCategory ?? OTHER_CATEGORY_NAME })
      return
    }
    if (aiCategory) {
      await addGroceryItemUnlessActiveDuplicate({ name, category: aiCategory })
      return
    }
    let items: { item: string; category: string }[] = []
    try {
      items = await categorizeItem(name)
    } catch {
      // Categorization is an enhancement; adding to "Other" keeps the quick path reliable.
    }
    if (items.length === 0) items = [{ item: name, category: OTHER_CATEGORY_NAME }]

    for (const item of items) {
      await addGroceryItemUnlessActiveDuplicate({ name: item.item, category: item.category })
    }
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
    if (!(await confirm(t('shoppingList:deleteListConfirm', { listName: activeList, count }))))
      return
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

  const renderItem = (entry: GroceryItem) => (
    <ShoppingListItemRow
      key={entry.key}
      delayPurchase
      showCountdown={behavior.showCountdown}
      purchaseGesture={behavior.purchaseGesture}
      entry={entry}
      canEdit={canEdit}
      draggable={canEdit && behavior.purchaseGesture === 'tap' && !entry.bought}
      dragging={draggingKey === entry.key}
      onDragStart={handleDragStart(entry)}
      onDragEnd={handleDragEnd}
      onCheckedChange={() => handleItemCheckedChange(entry)}
      onEditClick={() => setSelectedEntry(entry)}
      onUrgencyChange={urgency => listApi.updateGroceryItemUrgency(entry.key, urgency, user)}
    />
  )

  return (
    <>
      <div className={`shopping-workspace${behavior.showChef ? '' : ' no-chef'}`}>
        <section className="shopping-primary" aria-label={t('tabs.shoppingList')}>
          <div className="shop-overview">
            <div>
              <strong>{visibleEntries.length - purchasedCount}</strong>
              <span>{t('workspace.leftToGet')}</span>
            </div>
            <span className="shop-completed">
              <Check size={16} aria-hidden="true" />
              {t('workspace.packed', { count: purchasedCount })}
            </span>
            {visibleEntries.some((entry) => !entry.bought) && (
              <button
                className="workspace-icon"
                onClick={handleShareMissing}
                aria-label={t('shoppingList:listPicker.shareMissing')}
              >
                <Share2 size={18} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="shopping-toolbar">
            <ListPicker
              activeList={activeList}
              customLists={sortedCustomLists}
              onSelectList={(l) => navigate({ search: { list: l || undefined } })}
            />
            <button
              className="workspace-icon"
              aria-label={t('workspace.filterList')}
              aria-expanded={toolsOpen}
              aria-controls="shopping-filters"
              onClick={() => {
                setToolsOpen(!toolsOpen)
                if (toolsOpen) setSearch('')
              }}
            >
              <SlidersHorizontal size={18} aria-hidden="true" />
            </button>
          </div>
          {canEdit && (
            <div className="shopping-composer">
              <QuickAddBar
                aiAvailable={!localMock}
                ref={quickAddInputRef}
                categories={categories}
                onAdd={handleQuickAdd}
                onAddCategory={(category) => listApi.addCategory(category)}
              />
              <button
                className="detailed-add"
                onClick={() => {
                  setAddModalInitialName(undefined)
                  setShowAddGrocery(true)
                }}
              >
                <Plus size={15} aria-hidden="true" />
                {t('workspace.addDetails')}
              </button>
            </div>
          )}
          {toolsOpen && (
            <div id="shopping-filters" className="list-controls-row">
              <ShoppingListSearch value={search} onChange={setSearch} />
              <ShoppingListSort value={sortOption} onChange={setSortOption} />
            </div>
          )}
          {isLoading && visibleEntries.length === 0 ? (
            <ListSkeleton variant="flat" sections={3} rows={3} />
          ) : query && allResultsEmpty && canEdit ? (
            <SearchSuggestAdd query={search.trim()} onSuggestAdd={handleSuggestAdd} />
          ) : visibleEntries.length === 0 ? (
            <div className="workspace-empty">
              <ShoppingBasket />
              <h3>{t('workspace.emptyShopTitle')}</h3>
              <p>{t('shoppingList:empty')}</p>
            </div>
          ) : (
            <div className="shopping-list-scroll">
              {activeResultsEmpty && query && (
                <div className="shopping-empty-card">
                  {t('shoppingList:search.noResults', { query: search.trim() })}
                </div>
              )}
              {urgentEntries.length > 0 && <section className="urgent-products" aria-label={t('shoppingList:urgency.section')}>
                <h2>{t('shoppingList:urgency.section')} <small>{urgentEntries.length}</small></h2>
                <ul className="items">{urgentEntries.map(renderItem)}</ul>
              </section>}
              {behavior.listPresentation === 'flat' ? <ul className="items simple-shopping-list">{sortGroceryItems(mainEntries, sortOption, i18n.language).map(renderItem)}</ul> : visibleCategories.map(({ name, color, icon }) => (
                <CategorySection
                  key={name}
                  name={name}
                  color={color}
                  icon={icon}
                  uncheckedCount={uncheckedCountByCategory[name] || 0}
                  uncheckedCountLabel={t('shoppingList:category.uncheckedCount', {
                    count: uncheckedCountByCategory[name] || 0
                  })}
                  collapsed={isCollapsed(name)}
                  onToggle={() => toggle(name)}
                  dragOver={dragOverCategory === name}
                  onDragOver={canEdit ? handleDragOverCategory(name) : undefined}
                  onDragLeave={canEdit ? handleDragLeaveCategory(name) : undefined}
                  onDrop={canEdit ? handleDropOnCategory(name) : undefined}
                >
                  {grouped[name].map(renderItem)}
                </CategorySection>
              ))}

              {!keepBoughtItemsInCategories && purchasedCount > 0 && (
                <CategorySection
                  name={t('shoppingList:purchased.sectionLabel', { count: purchasedCount })}
                  color="#8ee6a8"
                  icon="✓"
                  collapsed={!showPurchased}
                  onToggle={toggleShowPurchased}
                >
                  {searchedPurchasedEntries.length > 0 ? (
                    searchedPurchasedEntries.map(renderItem)
                  ) : (
                    <li className="completed-filter-empty">
                      {t('shoppingList:search.noResults', { query: search.trim() })}
                    </li>
                  )}
                </CategorySection>
              )}
            </div>
          )}

        </section>
        {behavior.showChef && <aside className="shopping-aside">
          <div className="next-meal-card">
            <span className="workspace-kicker">{t('workspace.nextMeal')}</span>
            <CookingPot size={46} strokeWidth={1.2} aria-hidden="true" />
            <h3>{t('workspace.cookWhatYouHave')}</h3>
            <p>{t('workspace.cookFromBought')}</p>
            <div className="ingredient-peek">
              {chefAvailableProducts.slice(0, 4).map((entry) => (
                <span key={entry.key}>{entry.item}</span>
              ))}
            </div>
            <Link to="/recipes" className="workspace-link-button">
              {t('workspace.openCook')}
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <Link to="/stock" className="kitchen-shortcut">
            <span>
              <strong>{t('workspace.checkKitchen')}</strong>
              <small>{t('workspace.checkKitchenHint')}</small>
            </span>
            <ArrowUpRight size={20} aria-hidden="true" />
          </Link>
        </aside>}
      </div>
      {selectedEntry && (
        <ItemDetailModal
          entry={selectedEntry}
          canEdit={canEdit}
          categories={categories}
          onSignIn={onSignIn}
          onClose={() => setSelectedEntry(null)}
          onSave={(key, details) => listApi.saveItemDetails(key, details, user)}
          onDelete={(key) => listApi.deleteItem(key, selectedEntry.image_ref, user)}
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
              const category = categoryMap.has(entry.category)
                ? entry.category
                : OTHER_CATEGORY_NAME
              listApi.addStockItem(
                {
                  name: entry.item,
                  category,
                  quantity: amount,
                  unit: StockUnit.Piece,
                  low_threshold: 1
                },
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
          categories={categories}
          onClose={() => {
            setShowAddGrocery(false)
            setAddModalInitialName(undefined)
          }}
          onAdd={addGroceryItemUnlessActiveDuplicate}
          onAddCategory={(category) => listApi.addCategory(category)}
        />
      )}

      {showBulkUpload && (
        <BulkUploadModal
          listName={activeList}
          categories={categories}
          existingEntries={visibleEntries
            .filter((e) => !e.bought)
            .map((e) => ({ key: e.key, name: e.item, category: e.category }))}
          onClose={() => setShowBulkUpload(false)}
          onAdd={addGroceryItemUnlessActiveDuplicate}
          onUpdateDetails={(key, fields) => fields.note === undefined
            ? listApi.updateGroceryItemQuantity(key, fields, user)
            : listApi.saveItemDetails(key, fields, user)}
          onAddCategory={(category) => listApi.addCategory(category)}
        />
      )}
    </>
  )
}

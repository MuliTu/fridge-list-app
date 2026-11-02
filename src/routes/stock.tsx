import { useEffect, useState, type CSSProperties } from 'react'
import { Package, Search, Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { onValue } from '../lib/firebase'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { useCategories } from '../hooks/useCategories'
import { formatDateTime } from '../lib/formatDateTime'
import { useCollapsedSections } from '../hooks/useCollapsedSections'
import { useAuth } from '../hooks/AuthContext'
import { useActiveList, useListApi } from '../hooks/ListContext'
import { useDialogService } from '../hooks/DialogServiceContext'
import StockItemModal from '../components/StockItemModal'
import ListSkeleton from '../components/ListSkeleton'
import type { StockItem } from '../types'

export const Route = createFileRoute('/stock')({
  component: StockPage
})

function StockPage() {
  const { t } = useTranslation(['stock', 'common'])
  const { user } = useAuth()
  const { canEdit } = useActiveList()
  const listApi = useListApi()
  const { confirm, alert } = useDialogService()
  const [entries, setEntries] = useState<StockItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [editingItem, setEditingItem] = useState<StockItem | null>(null)
  const { isCollapsed, toggle } = useCollapsedSections()
  const { categories, categoryMap } = useCategories()

  useEffect(() => {
    setIsLoading(true)
    return onValue(listApi.stockRef, (snapshot) => {
      const data = snapshot.val() || {}
      setEntries(
        Object.entries(data as Record<string, any>).map(([key, entry]) => ({ key, ...entry }))
      )
      setIsLoading(false)
    })
  }, [listApi])

  const lowCount = entries.filter((entry) => entry.quantity <= entry.low_threshold).length
  const filteredEntries = entries.filter(
    (entry) =>
      (!lowOnly || entry.quantity <= entry.low_threshold) &&
      entry.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  )
  const grouped: Record<string, StockItem[]> = {}
  filteredEntries.forEach((entry) => {
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

  const describeError = (action: string, err: any) => {
    const message = String(err?.code || err?.message || '').includes('PERMISSION_DENIED')
      ? t('stock:errors.permissionDenied')
      : err.message
    return `${action}: ${message}`
  }

  const handleAdjust = async (entry: StockItem, delta: number) => {
    try {
      await listApi.adjustStockQuantity(entry.key, entry.quantity + delta, user)
    } catch (err) {
      await alert(describeError(t('stock:actions.adjustFailed'), err))
    }
  }

  const handleDelete = async (entry: StockItem) => {
    if (!(await confirm(t('stock:actions.deleteConfirm', { name: entry.name })))) return
    try {
      await listApi.deleteStockItem(entry.key)
    } catch (err) {
      await alert(describeError(t('stock:actions.deleteFailed'), err))
    }
  }

  const handleAddToShoppingList = (entry: StockItem) => {
    listApi.addStockItemToShoppingList(entry, user)
  }

  return (
    <div className="stock-view kitchen-workspace">
      <div className="workspace-toolbar">
        <div className="stock-filters">
          <button
            aria-pressed={!lowOnly}
            className={!lowOnly ? 'active' : ''}
            onClick={() => setLowOnly(false)}
          >
            {t('common:workspace.allStock')} <span>{isLoading ? '—' : entries.length}</span>
          </button>
          <button
            aria-pressed={lowOnly}
            className={lowOnly ? 'active' : ''}
            onClick={() => setLowOnly(true)}
          >
            {t('common:workspace.runningLow')} <span>{isLoading ? '—' : lowCount}</span>
          </button>
        </div>
        {canEdit && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus aria-hidden="true" />
            {t('common:workspace.addStock')}
          </Button>
        )}
      </div>
      <label className="collection-search stock-search">
        <Search size={17} aria-hidden="true" />
        <input
          aria-label={t('common:workspace.searchStock')}
          placeholder={t('common:workspace.searchStock')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {isLoading && isEmpty ? (
        <ListSkeleton variant="grid" sections={3} rows={3} />
      ) : isEmpty ? (
        <div className="workspace-empty">
          <Package aria-hidden="true" />
          <h3>
            {t(entries.length ? 'common:workspace.noMatches' : 'common:workspace.emptyKitchen')}
          </h3>
          <p>
            {entries.length
              ? t('common:workspace.trySearch')
              : canEdit
                ? t('stock:emptyAddFirst')
                : t('stock:emptyViewOnly')}
          </p>
        </div>
      ) : (
        <div className="board-grid">
          {visibleCategories.map(({ name, color, icon }) => (
            <section className="panel" key={name} style={{ '--accent': color } as CSSProperties}>
              <h2 className="panel-header">
                <button
                  type="button"
                  className="stock-category-toggle"
                  onClick={() => toggle(name)}
                  aria-expanded={!isCollapsed(name)}
                >
                  <span className="cat-icon" aria-hidden="true">
                    {icon}
                  </span>
                  {name}
                  <span
                    className={`chevron${isCollapsed(name) ? ' collapsed' : ''}`}
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                </button>
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
                            {entry.updated_by
                              ? t('stock:updatedCaptionWithEmail', {
                                  date: formatDateTime(entry.updated_at),
                                  email: entry.updated_by
                                })
                              : t('stock:updatedCaption', {
                                  date: formatDateTime(entry.updated_at)
                                })}
                          </div>
                        )}
                        <div className="stock-actions">
                          <button
                            className="stepper-btn"
                            disabled={!canEdit}
                            onClick={() => handleAdjust(entry, -1)}
                            aria-label={t('stock:actions.decrease')}
                          >
                            −
                          </button>
                          <button
                            className="stepper-btn"
                            disabled={!canEdit}
                            onClick={() => handleAdjust(entry, 1)}
                            aria-label={t('stock:actions.increase')}
                          >
                            +
                          </button>
                          {isLow && canEdit && (
                            <button
                              className="add-to-list-btn"
                              onClick={() => handleAddToShoppingList(entry)}
                            >
                              {t('stock:actions.addToList')}
                            </button>
                          )}
                          {canEdit && (
                            <button
                              className="stock-icon-btn"
                              onClick={() => setEditingItem(entry)}
                              aria-label={t('stock:actions.edit')}
                            >
                              <Pencil size={17} aria-hidden="true" />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              className="stock-icon-btn stock-delete-btn"
                              onClick={() => handleDelete(entry)}
                              aria-label={t('stock:actions.delete')}
                            >
                              <Trash2 size={17} aria-hidden="true" />
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

      {(showAdd || editingItem) && (
        <StockItemModal
          item={editingItem}
          categories={categories}
          onClose={() => {
            setShowAdd(false)
            setEditingItem(null)
          }}
          onSubmit={(fields) =>
            editingItem
              ? listApi.updateStockItem(
                  editingItem.key,
                  fields as unknown as Record<string, unknown>,
                  user
                )
              : listApi.addStockItem(fields, user)
          }
        />
      )}
    </div>
  )
}

import type { DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '../lib/formatDateTime'
import type { GroceryItem } from '../types'

interface ShoppingListItemRowProps {
  entry: GroceryItem
  onClick: () => void
  onInfoClick: () => void
  draggable?: boolean
  dragging?: boolean
  onDragStart?: (e: DragEvent<HTMLLIElement>) => void
  onDragEnd?: (e: DragEvent<HTMLLIElement>) => void
}

export default function ShoppingListItemRow({
  entry,
  onClick,
  onInfoClick,
  draggable = false,
  dragging = false,
  onDragStart,
  onDragEnd
}: ShoppingListItemRowProps) {
  const { t } = useTranslation()
  return (
    <li
      className={`item${entry.isFresh ? ' fresh' : ''}${entry.bought ? ' bought' : ''}${dragging ? ' dragging' : ''}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="item-row">
        <span className="item-top">
          <span>{entry.item}</span>
          {entry.quantity != null && (
            <span className="item-quantity">
              ({entry.quantity}
              {entry.unit ? ` ${entry.unit}` : ''})
            </span>
          )}
          {entry.note && <span className="item-icon">📝</span>}
          {entry.image_url && <span className="item-icon">📷</span>}
          <button
            className="stock-icon-btn item-info-btn"
            onClick={(e) => {
              e.stopPropagation()
              onInfoClick()
            }}
            aria-label={t('shoppingList:item.info')}
          >
            ℹ️
          </button>
        </span>
        <span className="item-meta">
          {entry.bought
            ? t('shoppingList:item.bought', {
                name: entry.modified_by || t('shoppingList:item.siri'),
                date: formatDateTime(entry.modified_at) || ''
              })
            : t('shoppingList:item.added', {
                name: entry.created_by || t('shoppingList:item.siri'),
                date: formatDateTime(entry.added_at) || ''
              })}
        </span>
      </span>
    </li>
  )
}

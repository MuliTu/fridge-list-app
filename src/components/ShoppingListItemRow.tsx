import { useTranslation } from 'react-i18next'
import { formatDateTime } from '../lib/formatDateTime'
import type { GroceryItem } from '../types'

interface ShoppingListItemRowProps {
  entry: GroceryItem
  onClick: () => void
  onInfoClick: () => void
}

export default function ShoppingListItemRow({ entry, onClick, onInfoClick }: ShoppingListItemRowProps) {
  const { t } = useTranslation()
  return (
    <li
      className={`item${entry.isFresh ? ' fresh' : ''}${entry.bought ? ' bought' : ''}`}
      onClick={onClick}
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

import { useId, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '../lib/formatDateTime'
import type { GroceryItem } from '../types'
import { Checkbox } from './ui/checkbox'
import { Popover, PopoverArrow, PopoverClose, PopoverContent, PopoverTrigger } from './ui/popover'

interface ShoppingListItemRowProps {
  entry: GroceryItem
  onCheckedChange: () => void
  onEditClick?: () => void
  canEdit?: boolean
  draggable?: boolean
  dragging?: boolean
  onDragStart?: (e: DragEvent<HTMLLIElement>) => void
  onDragEnd?: (e: DragEvent<HTMLLIElement>) => void
}

export default function ShoppingListItemRow({
  entry,
  onCheckedChange,
  onEditClick,
  canEdit = true,
  draggable = false,
  dragging = false,
  onDragStart,
  onDragEnd
}: ShoppingListItemRowProps) {
  const { t } = useTranslation()
  const checkboxId = useId()
  const createdAt = formatDateTime(entry.added_at)
  const modifiedAt = formatDateTime(entry.modified_at)

  return (
    <li
      className={`item${entry.isFresh ? ' fresh' : ''}${entry.bought ? ' bought' : ''}${dragging ? ' dragging' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="item-card">
        <Checkbox
          id={checkboxId}
          className="item-checkbox"
          checked={entry.bought}
          disabled={!canEdit}
          onCheckedChange={onCheckedChange}
          aria-label={t(entry.bought ? 'shoppingList:item.markUnbought' : 'shoppingList:item.markBought', {
            item: entry.item
          })}
        />
        <label className="item-row" htmlFor={checkboxId}>
          <span className="item-top">
            <span className="item-name">{entry.item}</span>
            {entry.quantity != null && (
              <span className="item-quantity">
                ({entry.quantity}
                {entry.unit ? ` ${entry.unit}` : ''})
              </span>
            )}
            {entry.note && <span className="item-icon">📝</span>}
            {entry.image_url && <span className="item-icon">📷</span>}
          </span>
        </label>
        <Popover>
          <PopoverTrigger asChild>
            <button className="stock-icon-btn item-info-btn" aria-label={t('shoppingList:item.info')}>
              <span aria-hidden="true">i</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="item-meta-popover">
            <div className="item-meta-title">{t('shoppingList:item.metadataTitle')}</div>
            {createdAt && (
              <div>
                {t('common:itemDetail.createdBy')}: {createdAt} · {entry.created_by || t('shoppingList:item.siri')}
              </div>
            )}
            {modifiedAt && (
              <div>
                {t('common:itemDetail.updatedBy')}: {modifiedAt} · {entry.modified_by || t('shoppingList:item.siri')}
              </div>
            )}
            {onEditClick && (
              <PopoverClose asChild>
                <button type="button" className="item-meta-edit" onClick={onEditClick}>
                  {t('shoppingList:item.edit')}
                </button>
              </PopoverClose>
            )}
            <PopoverArrow />
          </PopoverContent>
        </Popover>
      </div>
    </li>
  )
}

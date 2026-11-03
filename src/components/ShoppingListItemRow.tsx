import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { normalizeUrgency, URGENCY_LEVELS, type GroceryUrgency } from '../lib/groceryUrgency'
import type { PurchaseGesture } from '../lib/behaviorSettings'
import { formatDateTime } from '../lib/formatDateTime'
import type { GroceryItem } from '../types'
import { Checkbox } from './ui/checkbox'
import { Popover, PopoverArrow, PopoverClose, PopoverContent, PopoverTrigger } from './ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface ShoppingListItemRowProps {
  entry: GroceryItem
  delayPurchase?: boolean
  showCountdown?: boolean
  purchaseGesture?: PurchaseGesture
  onUrgencyChange?: (urgency: GroceryUrgency) => PromiseLike<unknown>
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
  delayPurchase = false,
  showCountdown = true,
  purchaseGesture = 'tap',
  onUrgencyChange,
  onCheckedChange,
  onEditClick,
  canEdit = true,
  draggable = false,
  dragging = false,
  onDragStart,
  onDragEnd
}: ShoppingListItemRowProps) {
  const { t } = useTranslation()
  const [holding, setHolding] = useState(false)
  const [pressPosition, setPressPosition] = useState({ x: 0, y: 0 })
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdOrigin = useRef<{ x: number; y: number } | null>(null)
  const [urgencySaving, setUrgencySaving] = useState(false)
  const [urgencyError, setUrgencyError] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const callbackRef = useRef(onCheckedChange)
  callbackRef.current = onCheckedChange
  const pending = remaining !== null
  useEffect(() => {
    if (!pending) return
    const deadline = Date.now() + 5000
    const interval = window.setInterval(() => {
      setRemaining(Math.max(1, Math.ceil((deadline - Date.now()) / 1000)))
    }, 100)
    const timeout = window.setTimeout(() => {
      setRemaining(null)
      callbackRef.current()
    }, 5000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [pending])
  useEffect(() => {
    if (!canEdit || entry.bought || purchaseGesture === 'hold') setRemaining(null)
  }, [canEdit, entry.bought, purchaseGesture])
  const handleCheck = () => {
    if (!canEdit) return
    if (pending) setRemaining(null)
    else if (delayPurchase && purchaseGesture !== 'hold' && !entry.bought) setRemaining(5)
    else onCheckedChange()
  }
  const cancelHold = () => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current)
    holdTimer.current = null
    holdOrigin.current = null
    setHolding(false)
  }
  useEffect(() => {
    window.addEventListener('scroll', cancelHold, true)
    return () => {
      window.removeEventListener('scroll', cancelHold, true)
      if (holdTimer.current !== null) clearTimeout(holdTimer.current)
    }
  }, [])
  useEffect(() => { cancelHold() }, [canEdit, purchaseGesture, entry.bought])
  const isPurchaseTarget = (target: EventTarget) => target instanceof Element && !!target.closest('.item-row, .item-checkbox')
  const startHold = (event: PointerEvent<HTMLDivElement>) => {
    if (purchaseGesture !== 'hold' || !canEdit || event.button !== 0 || !isPurchaseTarget(event.target)) return
    cancelHold()
    const bounds = event.currentTarget.getBoundingClientRect()
    setPressPosition({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
    holdOrigin.current = { x: event.clientX, y: event.clientY }
    setHolding(true)
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null
      holdOrigin.current = null
      setHolding(false)
      handleCheck()
    }, 1000)
  }
  const moveHold = (event: PointerEvent<HTMLDivElement>) => {
    const origin = holdOrigin.current
    if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) cancelHold()
  }
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
      <div
        className={`item-card purchase-target${holding ? ' is-holding' : ''}`}
        style={{ '--press-x': `${pressPosition.x}px`, '--press-y': `${pressPosition.y}px` } as CSSProperties}
        onPointerDown={startHold}
        onPointerMove={moveHold}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onPointerLeave={cancelHold}
        onClickCapture={event => {
          if (purchaseGesture === 'hold' && event.detail > 0 && isPurchaseTarget(event.target)) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
        onContextMenu={event => { if (purchaseGesture === 'hold' && isPurchaseTarget(event.target)) event.preventDefault() }}
      >
        <Checkbox
          id={checkboxId}
          className="item-checkbox"
          checked={entry.bought || pending}
          disabled={!canEdit}
          onCheckedChange={handleCheck}
          aria-description={purchaseGesture === 'hold' ? t('shoppingList:item.holdHint') : undefined}
          aria-label={t(entry.bought ? 'shoppingList:item.markUnbought' : 'shoppingList:item.markBought', {
            item: entry.item
          })}
        />
        <label className="item-row" htmlFor={checkboxId}>
          <span className="item-top">
            <span className="item-name">{entry.item}</span>
            {normalizeUrgency(entry.urgency) !== 'normal' && <span className={`urgency-badge urgency-${normalizeUrgency(entry.urgency)}`}>{t(`shoppingList:urgency.${normalizeUrgency(entry.urgency)}`)}</span>}
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
            {onUrgencyChange && <label className="item-urgency-control">
              {t('shoppingList:urgency.label')}
              <Select value={normalizeUrgency(entry.urgency)} disabled={!canEdit || urgencySaving} onValueChange={async value => {
                setUrgencySaving(true)
                setUrgencyError(false)
                try { await onUrgencyChange(value as GroceryUrgency) }
                catch { setUrgencyError(true) }
                finally { setUrgencySaving(false) }
              }}>
                <SelectTrigger className="mobile-picker-trigger" aria-label={t('shoppingList:urgency.label')}><SelectValue /></SelectTrigger>
                <SelectContent className="mobile-picker-content z-[60]" collisionPadding={12}>
                  {URGENCY_LEVELS.map(level => <SelectItem key={level} value={level} className="mobile-picker-option">{t(`shoppingList:urgency.${level}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>}
            {urgencyError && <p role="alert">{t('shoppingList:urgency.saveFailed')}</p>}
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
      {pending && (
        <div className="purchase-pending">
          <span role="status">{showCountdown ? t('shoppingList:item.purchasePending', { count: remaining }) : t('shoppingList:item.purchasePendingNoTimer')}</span>
          <button type="button" onClick={() => setRemaining(null)}>
            {t('shoppingList:item.cancelPurchase')}
          </button>
        </div>
      )}
    </li>
  )
}

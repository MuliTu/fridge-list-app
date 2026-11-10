import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'

type CategorySectionProps = {
  name: string
  color: string
  icon: string
  uncheckedCount?: number
  uncheckedCountLabel?: string
  collapsed: boolean
  searchQuery?: string
  onToggle: () => void
  children: ReactNode
  dragOver?: boolean
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave?: (e: DragEvent<HTMLDivElement>) => void
  onDrop?: (e: DragEvent<HTMLDivElement>) => void
}

export default function CategorySection({
  name,
  color,
  icon,
  uncheckedCount,
  uncheckedCountLabel,
  collapsed,
  searchQuery = '',
  onToggle,
  children,
  dragOver = false,
  onDragOver,
  onDragLeave,
  onDrop
}: CategorySectionProps) {
  const contentId = useId()
  const collapseTrigger = useRef<HTMLButtonElement | null>(null)
  const [searchCollapsed, setSearchCollapsed] = useState(false)
  const contentCollapsed = searchQuery ? searchCollapsed : collapsed

  useEffect(() => {
    setSearchCollapsed(false)
  }, [searchQuery])

  useLayoutEffect(() => {
    const trigger = collapseTrigger.current
    collapseTrigger.current = null
    // A pinned heading can leave the scrollport when its section shrinks.
    if (contentCollapsed) trigger?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [contentCollapsed])

  return (
    <div
      className={`flat-section${dragOver ? ' drag-over' : ''}`}
      style={{ '--accent': color } as CSSProperties}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <h2 className="flat-section-heading">
        <button
          type="button"
          className="flat-section-header"
          onClick={event => {
            const trigger = event.currentTarget
            const heading = trigger.parentElement
            if (!contentCollapsed && heading && getComputedStyle(heading).position === 'sticky') {
              collapseTrigger.current = trigger
            }
            if (searchQuery) setSearchCollapsed(previous => !previous)
            else onToggle()
          }}
          aria-expanded={!contentCollapsed}
          aria-controls={contentId}
        >
          <span className="category-accent" aria-hidden="true" />
          <span className="cat-icon" aria-hidden="true">{icon}</span>
          <span>{name}</span>
          {uncheckedCount !== undefined && (
            <span className="category-unchecked-count" aria-label={uncheckedCountLabel}>
              {uncheckedCount}
            </span>
          )}
          <span className={`chevron${contentCollapsed ? ' collapsed' : ''}`} aria-hidden="true">⌄</span>
        </button>
      </h2>
      {!contentCollapsed && <ul id={contentId} className="items">{children}</ul>}
    </div>
  )
}

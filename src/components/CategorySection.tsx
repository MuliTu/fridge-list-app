import { useId, type CSSProperties, type DragEvent, type ReactNode } from 'react'

interface CategorySectionProps {
  name: string
  color: string
  icon: string
  collapsed: boolean
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
  collapsed,
  onToggle,
  children,
  dragOver = false,
  onDragOver,
  onDragLeave,
  onDrop
}: CategorySectionProps) {
  const contentId = useId()

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
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={contentId}
        >
          <span className="category-accent" aria-hidden="true" />
          <span className="cat-icon" aria-hidden="true">{icon}</span>
          <span>{name}</span>
          <span className={`chevron${collapsed ? ' collapsed' : ''}`} aria-hidden="true">⌄</span>
        </button>
      </h2>
      {!collapsed && <ul id={contentId} className="items">{children}</ul>}
    </div>
  )
}

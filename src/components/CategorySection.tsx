import type { CSSProperties, DragEvent, ReactNode } from 'react'

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
  return (
    <div
      className={`flat-section${dragOver ? ' drag-over' : ''}`}
      style={{ '--accent': color } as CSSProperties}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <h2 className="flat-section-header" onClick={onToggle}>
        <span className="cat-icon">{icon}</span>
        {name}
        <span className={`chevron${collapsed ? ' collapsed' : ''}`}>▾</span>
      </h2>
      {!collapsed && <ul className="items">{children}</ul>}
    </div>
  )
}

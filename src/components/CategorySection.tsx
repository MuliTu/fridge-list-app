import type { CSSProperties, ReactNode } from 'react'

interface CategorySectionProps {
  name: string
  color: string
  icon: string
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}

export default function CategorySection({ name, color, icon, collapsed, onToggle, children }: CategorySectionProps) {
  return (
    <div className="flat-section" style={{ '--accent': color } as CSSProperties}>
      <h2 className="flat-section-header" onClick={onToggle}>
        <span className="cat-icon">{icon}</span>
        {name}
        <span className={`chevron${collapsed ? ' collapsed' : ''}`}>▾</span>
      </h2>
      {!collapsed && <ul className="items">{children}</ul>}
    </div>
  )
}

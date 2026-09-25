import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export const SHOPPING_TOP_COLLAPSED_KEY = 'shoppingListTopCollapsed'

interface ShoppingListTopPanelProps {
  children: ReactNode
  onCollapse?: () => void
  onCollapsedChange?: (collapsed: boolean) => void
}

export default function ShoppingListTopPanel({
  children,
  onCollapse,
  onCollapsedChange
}: ShoppingListTopPanelProps) {
  const { t } = useTranslation('shoppingList')
  // Always start expanded during SSR/hydration, then restore the local preference.
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      const restored = localStorage.getItem(SHOPPING_TOP_COLLAPSED_KEY) === 'true'
      setCollapsed(restored)
      onCollapsedChange?.(restored)
    } catch {
      // Storage is optional; the control still works for the current page session.
    }
  }, [])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(SHOPPING_TOP_COLLAPSED_KEY, String(next))
    } catch {
      // Ignore unavailable/private storage and keep the in-memory preference.
    }
    if (next) onCollapse?.()
    onCollapsedChange?.(next)
  }

  return (
    <div className="shopping-top-panel">
      <button
        type="button"
        className="shopping-top-toggle"
        aria-expanded={!collapsed}
        aria-controls="shopping-list-top-controls"
        onClick={toggle}
      >
        <span aria-hidden="true">{collapsed ? '⌄' : '⌃'}</span>
        {collapsed ? t('topPanel.show') : t('topPanel.hide')}
      </button>
      <div id="shopping-list-top-controls" hidden={collapsed}>
        {children}
      </div>
    </div>
  )
}

import { Link } from '@tanstack/react-router'
import { CookingPot, Leaf, Package, ReceiptText, ShoppingBasket } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type WorkspaceNavigationProps = { householdName: string; remainingCount: number | null; showChef?: boolean }

export function WorkspaceNavigation({ householdName, remainingCount, showChef = true }: WorkspaceNavigationProps) {
  const { t } = useTranslation()
  return (
    <aside className="workspace-rail">
      <div className="rail-brand">
        <Leaf aria-hidden="true" />
        <span>
          fridge<span className="brand-period">.</span>
        </span>
      </div>
      <div className="rail-household">
        <span className="household-monogram" aria-hidden="true">
          {householdName.slice(0, 1)}
        </span>
        <div>
          <small>{t('workspace.sharedSpace')}</small>
          <strong>{householdName}</strong>
        </div>
      </div>
      <nav className={`workspace-nav${showChef ? '' : ' without-chef'}`} aria-label={t('tabs.label')}>
        <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: 'active' }}>
          <ShoppingBasket aria-hidden="true" />
          <span>{t('workspace.nav.shop')}</span>
          {remainingCount !== null && remainingCount > 0 && <small>{remainingCount}</small>}
        </Link>
        <Link to="/stock" activeProps={{ className: 'active' }}>
          <Package aria-hidden="true" />
          <span>{t('workspace.nav.kitchen')}</span>
        </Link>
        {showChef && <Link to="/recipes" activeProps={{ className: 'active' }}>
          <CookingPot aria-hidden="true" />
          <span>{t('workspace.nav.cook')}</span>
        </Link>}
        <Link to="/receipts" activeProps={{ className: 'active' }}>
          <ReceiptText aria-hidden="true" />
          <span>{t('workspace.nav.receipts')}</span>
        </Link>
      </nav>
      <div className="rail-note">
        <Leaf aria-hidden="true" />
        <p>{t('workspace.railNote')}</p>
        <span>{t('workspace.railCaption')}</span>
      </div>
    </aside>
  )
}

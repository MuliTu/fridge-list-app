import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/AuthContext'
import { GroceriesFeedProvider, useGroceriesFeed } from '../hooks/GroceriesFeedContext'
import { useSyncHtmlLangDir } from '../hooks/useSyncHtmlLangDir'
import { changeLanguage, SUPPORTED_LANGUAGES } from '../i18n/config'
import CategoriesModal from './CategoriesModal'
import AdminsModal from './AdminsModal'
import { useCategories } from '../hooks/useCategories'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <GroceriesFeedProvider>
      <LayoutContent>{children}</LayoutContent>
    </GroceriesFeedProvider>
  )
}

function LayoutContent({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  useSyncHtmlLangDir()
  const { user, canEdit, onSignIn, onSignOut, authError } = useAuth()
  const { status, toast } = useGroceriesFeed()
  const [showMenu, setShowMenu] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [showAdmins, setShowAdmins] = useState(false)
  const { categories } = useCategories()

  const otherLanguage = SUPPORTED_LANGUAGES.find((lng) => lng !== i18n.language) || 'en'

  return (
    <div className="frame">
      <header>
        <div className="user-chip">
          <button
            className="icon-btn lang-switch-btn"
            onClick={() => changeLanguage(otherLanguage)}
            aria-label={t('language.label')}
          >
            {t(`language.${otherLanguage}`)}
          </button>
          {user ? (
            <>
              {canEdit && (
                <div className="menu-wrap">
                  <button className="icon-btn" onClick={() => setShowMenu((v) => !v)} aria-label={t('menu.button')}>
                    ⚙️
                  </button>
                  {showMenu && (
                    <>
                      <div className="menu-overlay" onClick={() => setShowMenu(false)} />
                      <div className="menu-dropdown">
                        <button
                          className="menu-item"
                          onClick={() => {
                            setShowMenu(false)
                            setShowCategories(true)
                          }}
                        >
                          {t('menu.manageCategories')}
                        </button>
                        <button
                          className="menu-item"
                          onClick={() => {
                            setShowMenu(false)
                            setShowAdmins(true)
                          }}
                        >
                          {t('menu.shareEditing')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <span>
                {user.displayName || user.email}
                {!canEdit && ` · ${t('auth.viewOnly')}`}
              </span>
              <button className="signout-btn" onClick={onSignOut}>
                {t('auth.signOut')}
              </button>
            </>
          ) : (
            <button className="signout-btn" onClick={onSignIn}>
              {t('auth.signIn')}
            </button>
          )}
        </div>
        {authError && (
          <div className="header-error">
            {t('auth.signInError')}: {authError}
          </div>
        )}
        <h1>🛒 {t('appTitle')}</h1>
        <div className="sub">{t('appSubtitle')}</div>
        <div className="tabs">
          <Link to="/" className="tab-btn" activeProps={{ className: 'tab-btn active' }} activeOptions={{ exact: true }}>
            🛒 {t('tabs.shoppingList')}
          </Link>
          <Link to="/stock" className="tab-btn" activeProps={{ className: 'tab-btn active' }}>
            📦 {t('tabs.stock')}
          </Link>
          <Link to="/receipts" className="tab-btn" activeProps={{ className: 'tab-btn active' }}>
            🧾 {t('tabs.receipts')}
          </Link>
        </div>
      </header>

      {toast && <div className="toast">🛒 {toast}</div>}

      {children}

      <div className="status">{status}</div>

      {showCategories && <CategoriesModal categories={categories} onClose={() => setShowCategories(false)} />}
      {showAdmins && <AdminsModal onClose={() => setShowAdmins(false)} />}
    </div>
  )
}

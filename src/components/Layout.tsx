import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { version as appVersion } from '../../package.json'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/AuthContext'
import { GroceriesFeedProvider, useGroceriesFeed } from '../hooks/GroceriesFeedContext'
import { DialogServiceProvider } from '../hooks/DialogServiceContext'
import { useSyncHtmlLangDir } from '../hooks/useSyncHtmlLangDir'
import { changeLanguage, SUPPORTED_LANGUAGES } from '../i18n/config'
import CategoriesModal from './CategoriesModal'
import AdminsModal from './AdminsModal'
import ChangelogModal from './ChangelogModal'
import { useCategories } from '../hooks/useCategories'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DialogServiceProvider>
      <GroceriesFeedProvider>
        <LayoutContent>{children}</LayoutContent>
      </GroceriesFeedProvider>
    </DialogServiceProvider>
  )
}

function LayoutContent({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  useSyncHtmlLangDir()
  const { user, canEdit, canView, authResolved, onSignIn, onSignOut, authError } = useAuth()
  const { status, toast } = useGroceriesFeed()
  const [showCategories, setShowCategories] = useState(false)
  const [showAdmins, setShowAdmins] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const { categories } = useCategories()

  const otherLanguage = SUPPORTED_LANGUAGES.find((lng) => lng !== i18n.language) || 'en'

  // Opening a Dialog directly from a DropdownMenuItem's onClick races the dropdown's
  // own closing cleanup (which resets document.body's scroll/pointer-events lock)
  // against the dialog's opening lock on the same element — whichever cleanup runs
  // last can clobber the other, permanently leaving <body> with `pointer-events:
  // none` after the dialog closes (confirmed directly: every button on the page
  // stopped responding to real clicks after closing a modal opened this way).
  // Deferring the state update by a tick lets the dropdown fully unmount first.
  const openAfterMenuCloses = (setOpen: (value: boolean) => void) => setTimeout(() => setOpen(true), 0)

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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="icon-btn" aria-label={t('menu.button')}>
                      ⚙️
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openAfterMenuCloses(setShowCategories)}>
                      {t('menu.manageCategories')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openAfterMenuCloses(setShowAdmins)}>
                      {t('menu.shareEditing')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openAfterMenuCloses(setShowChangelog)}>
                      {t('menu.viewChangelog')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <span>{user.displayName || user.email}</span>
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
        {authError && <div className="header-error">{authError}</div>}
        <h1>🛒 {t('appTitle')}</h1>
        <div className="sub">{t('appSubtitle')}</div>
        {canView && (
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
        )}
      </header>

      {/* Viewing this app's data now requires being an invited household member —
          only render the toast/routed page/status (all derived from live grocery
          data) once that's confirmed, never for an unresolved, signed-out, or
          uninvited visitor. authResolved distinguishes "still checking" from
          "definitely signed out" so a returning authenticated user doesn't flash a
          sign-in screen while Firebase resolves their existing session. */}
      {!authResolved ? (
        <div className="all-empty">{t('auth.checkingSession')}</div>
      ) : !user ? (
        <div className="all-empty">{t('auth.signInRequired')}</div>
      ) : !canView ? (
        <div className="all-empty">{t('auth.noAccess')}</div>
      ) : (
        <>
          {toast && <div className="toast">🛒 {toast}</div>}
          {children}
          <div className="status">
            {status} · v{appVersion}
          </div>
        </>
      )}

      {showCategories && <CategoriesModal categories={categories} onClose={() => setShowCategories(false)} />}
      {showAdmins && <AdminsModal onClose={() => setShowAdmins(false)} />}
      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
    </div>
  )
}

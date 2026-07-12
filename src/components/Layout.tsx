import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { version as appVersion } from '../../package.json'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/AuthContext'
import { ListProvider, useActiveList } from '../hooks/ListContext'
import { GroceriesFeedProvider, useGroceriesFeed } from '../hooks/GroceriesFeedContext'
import { DialogServiceProvider, useDialogService } from '../hooks/DialogServiceContext'
import { useSyncHtmlLangDir } from '../hooks/useSyncHtmlLangDir'
import { changeLanguage, SUPPORTED_LANGUAGES } from '../i18n/config'
import CategoriesModal from './CategoriesModal'
import ListMembersModal from './ListMembersModal'
import ChangelogModal from './ChangelogModal'
import FeedbackModal from './FeedbackModal'
import FeedbackStatusToast from './FeedbackStatusToast'
import { useCategories } from '../hooks/useCategories'
import { useFeedbackToast } from '../hooks/useFeedbackToast'
import { useStockSuggestion } from '../hooks/useStockSuggestion'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DialogServiceProvider>
      <ListProvider>
        <GroceriesFeedProvider>
          <LayoutContent>{children}</LayoutContent>
        </GroceriesFeedProvider>
      </ListProvider>
    </DialogServiceProvider>
  )
}

function LayoutContent({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation()
  useSyncHtmlLangDir()
  const { user, authResolved, onSignIn, onSignOut, authError } = useAuth()
  const { myLists, listsResolved, listsError, activeList, setActiveListId, renameActiveList, isOwner, canEdit, canView } =
    useActiveList()
  const { status, toast } = useGroceriesFeed()
  const { prompt } = useDialogService()
  const [showCategories, setShowCategories] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const { categories } = useCategories()
  // Feedback submission is non-blocking: the modal closes on submit and this drives
  // a transient status toast (pending → success/error) that outlives the modal.
  const { toast: feedbackToast, submit: submitFeedbackRequest, dismiss: dismissFeedbackToast } =
    useFeedbackToast()
  const { enabled: stockSuggestionEnabled, toggle: toggleStockSuggestion } = useStockSuggestion()

  const otherLanguage = SUPPORTED_LANGUAGES.find((lng) => lng !== i18n.language) || 'en'

  // Opening a Dialog directly from a DropdownMenuItem's onClick races the dropdown's
  // own closing cleanup (which resets document.body's scroll/pointer-events lock)
  // against the dialog's opening lock on the same element — whichever cleanup runs
  // last can clobber the other, permanently leaving <body> with `pointer-events:
  // none` after the dialog closes (confirmed directly: every button on the page
  // stopped responding to real clicks after closing a modal opened this way).
  // Deferring the state update by a tick lets the dropdown fully unmount first.
  const openAfterMenuCloses = (setOpen: (value: boolean) => void) => setTimeout(() => setOpen(true), 0)

  const handleRenameList = async () => {
    if (!activeList) return
    const name = await prompt(t('lists:renamePrompt'), activeList.name)
    const trimmed = name?.trim()
    if (!trimmed || trimmed === activeList.name) return
    renameActiveList(trimmed)
  }

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
                    {isOwner && (
                      <DropdownMenuItem onClick={() => openAfterMenuCloses(setShowMembers)}>
                        {t('menu.shareEditing', { listName: activeList?.name || '' })}
                      </DropdownMenuItem>
                    )}
                    {isOwner && (
                      <DropdownMenuItem onClick={handleRenameList}>{t('lists:renameMenuItem')}</DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => openAfterMenuCloses(setShowChangelog)}>
                      {t('menu.viewChangelog')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openAfterMenuCloses(setShowFeedback)}>
                      {t('menu.sendFeedback')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggleStockSuggestion() }}>
                      {stockSuggestionEnabled ? t('menu.stockSuggestionOn') : t('menu.stockSuggestionOff')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {myLists.length > 1 && activeList && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="list-switch-btn" aria-label={t('lists:switcherAria')}>
                      📋 {activeList.name}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {myLists.map((l) => (
                      <DropdownMenuItem key={l.id} onClick={() => setActiveListId(l.id)}>
                        {l.id === activeList.id ? '✓ ' : ''}
                        {l.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {myLists.length === 1 && activeList && <span className="list-name-display">📋 {activeList.name}</span>}
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

      {/* Viewing this app's data requires signing in with Google (anyone can — no
          app-wide invite gate). Every signed-in user automatically has their own
          list (auto-provisioned, see ListContext's ensureOwnList) — there's no
          "create a list" onboarding step. authResolved distinguishes "still
          checking session" from "definitely signed out"; listsResolved
          distinguishes "still checking this user's own list + memberships" from
          "confirmed" — each state gets its own screen so a returning user never
          flashes the wrong one while data is still loading.
          `!activeList` is a deliberate second, independent gate on top of
          `listsResolved` (not just a subset of it) — a real production crash
          showed listsResolved can end up true before myLists is actually
          populated (root cause still being chased, likely an SSR/hydration
          timing interaction with Firebase Auth's persisted-session callback),
          so any child that calls useListApi() must never be reachable without a
          real activeList regardless of what listsResolved says. Same loading
          copy as the listsResolved check, since to the user it's the same
          "still getting your list ready" wait either way. */}
      {!authResolved ? (
        <div className="all-empty">{t('auth.checkingSession')}</div>
      ) : !user ? (
        <div className="all-empty">{t('auth.signInRequired')}</div>
      ) : !listsResolved ? (
        <div className="all-empty">{t('lists:checkingLists')}</div>
      ) : listsError ? (
        <div className="all-empty list-onboarding">
          <p>{t('lists:loadError')}</p>
        </div>
      ) : !activeList ? (
        <div className="all-empty">{t('lists:checkingLists')}</div>
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
      {showMembers && <ListMembersModal onClose={() => setShowMembers(false)} />}
      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
      {showFeedback && (
        <FeedbackModal onClose={() => setShowFeedback(false)} onSubmit={submitFeedbackRequest} />
      )}
      <FeedbackStatusToast toast={feedbackToast} onDismiss={dismissFeedbackToast} />
    </div>
  )
}

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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet'

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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { categories } = useCategories()
  // Feedback submission is non-blocking: the modal closes on submit and this drives
  // a transient status toast (pending → success/error) that outlives the modal.
  const { toast: feedbackToast, submit: submitFeedbackRequest, dismiss: dismissFeedbackToast } =
    useFeedbackToast()
  const { enabled: stockSuggestionEnabled, toggle: toggleStockSuggestion } = useStockSuggestion()

  const otherLanguage = SUPPORTED_LANGUAGES.find((lng) => lng !== i18n.language) || 'en'

  // Opening a Dialog directly from a sidebar item's onClick races the sidebar's own
  // closing cleanup (which resets document.body's scroll/pointer-events lock)
  // against the dialog's opening lock on the same element — whichever cleanup runs
  // last can clobber the other, permanently leaving <body> with `pointer-events:
  // none` after the dialog closes (confirmed directly with the old DropdownMenu this
  // sidebar replaced: every button on the page stopped responding to real clicks
  // after closing a modal opened this way; the sidebar is itself a Radix Dialog, so
  // the same race applies here). Closing the sidebar first, then deferring the
  // follow-up action by a tick, lets the sidebar fully unmount before anything else
  // opens.
  const runAfterSidebarCloses = (fn: () => void) => {
    setSidebarOpen(false)
    setTimeout(fn, 0)
  }

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
            // modal={false}: a fully modal Radix Dialog locks the rest of the page
            // (document.body gets pointer-events: none, and everything outside the
            // dialog gets aria-hidden) for as long as it's open — correct for a true
            // dialog, but it means the hamburger trigger itself becomes unclickable
            // while the sidebar is open, breaking "tap the hamburger again to close"
            // (confirmed directly: elementFromPoint at the trigger's own coordinates
            // resolved to a different element once the lock kicked in). Navigation
            // drawers are the standard exception to full modality for exactly this
            // reason — non-modal still gets Escape-to-close and outside-tap-to-close
            // for free from Radix's own dismissable-layer behavior, it just doesn't
            // lock the rest of the page.
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen} modal={false}>
              <SheetTrigger asChild>
                <button className="icon-btn" aria-label={t('menu.button')}>
                  ☰
                </button>
              </SheetTrigger>
              <SheetContent closeLabel={t('actions.close')} hideClose>
                <SheetHeader>
                  <SheetTitle>{t('menu.button')}</SheetTitle>
                </SheetHeader>

                {activeList && (
                  <>
                    {myLists.length > 1 && (
                      <div className="sidebar-section-label">{t('lists:sectionLabel')}</div>
                    )}
                    {myLists.length > 1 ? (
                      myLists.map((l) => (
                        <button
                          key={l.id}
                          className={`sidebar-item${l.id === activeList.id ? ' active' : ''}`}
                          onClick={() => {
                            setActiveListId(l.id)
                            setSidebarOpen(false)
                          }}
                        >
                          📋 {l.name}
                          {l.id === activeList.id ? ' ✓' : ''}
                        </button>
                      ))
                    ) : (
                      <div className="sidebar-item">📋 {activeList.name}</div>
                    )}
                  </>
                )}

                {canEdit && (
                  <>
                    <div className="sidebar-divider" />
                    <div className="sidebar-section-label">{t('menu.sectionSettings')}</div>
                    <button
                      className="sidebar-item"
                      onClick={() => runAfterSidebarCloses(() => setShowCategories(true))}
                    >
                      {t('menu.manageCategories')}
                    </button>
                    {isOwner && (
                      <button
                        className="sidebar-item"
                        onClick={() => runAfterSidebarCloses(() => setShowMembers(true))}
                      >
                        {t('menu.shareEditing', { listName: activeList?.name || '' })}
                      </button>
                    )}
                    {isOwner && (
                      <button className="sidebar-item" onClick={() => runAfterSidebarCloses(handleRenameList)}>
                        {t('lists:renameMenuItem')}
                      </button>
                    )}
                    <button
                      className="sidebar-item"
                      onClick={() => runAfterSidebarCloses(() => setShowChangelog(true))}
                    >
                      {t('menu.viewChangelog')}
                    </button>
                    <button
                      className="sidebar-item"
                      onClick={() => runAfterSidebarCloses(() => setShowFeedback(true))}
                    >
                      {t('menu.sendFeedback')}
                    </button>
                    <button
                      className="sidebar-item"
                      onClick={() => {
                        setSidebarOpen(false)
                        toggleStockSuggestion()
                      }}
                    >
                      {stockSuggestionEnabled ? t('menu.stockSuggestionOn') : t('menu.stockSuggestionOff')}
                    </button>
                  </>
                )}

                <div className="sidebar-divider" />
                <div className="sidebar-user">{user.displayName || user.email}</div>
                <div className="sidebar-signout-row">
                  <button
                    className="sidebar-item"
                    onClick={() => {
                      setSidebarOpen(false)
                      onSignOut()
                    }}
                  >
                    {t('auth.signOut')}
                  </button>
                </div>
              </SheetContent>
            </Sheet>
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

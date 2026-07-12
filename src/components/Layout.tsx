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
import { deleteList, renameList } from '../lib/firebase'

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
  const { myLists, listsResolved, listsError, activeList, setActiveListId, createList, isOwner, canEdit, canView } =
    useActiveList()
  const { status, toast } = useGroceriesFeed()
  const { prompt, confirm } = useDialogService()
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

  const handleCreateFirstList = async () => {
    const name = await prompt(t('lists:createPrompt'), t('lists:defaultName', { name: user?.displayName || '' }))
    const trimmed = name?.trim()
    if (!trimmed) return
    createList(trimmed)
  }

  const handleRenameList = async () => {
    if (!activeList) return
    const name = await prompt(t('lists:renamePrompt'), activeList.name)
    const trimmed = name?.trim()
    if (!trimmed || trimmed === activeList.name) return
    renameList(activeList.id, trimmed)
  }

  const handleDeleteList = async () => {
    if (!activeList) return
    if (!(await confirm(t('lists:deleteConfirm', { listName: activeList.name })))) return
    deleteList(activeList.id)
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
                    <DropdownMenuItem onClick={() => openAfterMenuCloses(setShowMembers)}>
                      {t('menu.shareEditing', { listName: activeList?.name || '' })}
                    </DropdownMenuItem>
                    {isOwner && (
                      <DropdownMenuItem onClick={handleRenameList}>{t('lists:renameMenuItem')}</DropdownMenuItem>
                    )}
                    {isOwner && (
                      <DropdownMenuItem onClick={handleDeleteList}>{t('lists:deleteMenuItem')}</DropdownMenuItem>
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
          app-wide invite gate) and belonging to at least one list. authResolved
          distinguishes "still checking session" from "definitely signed out";
          listsResolved distinguishes "still checking this user's lists" from
          "confirmed, they have zero" — each state gets its own screen so a
          returning user never flashes the wrong one while data is still loading. */}
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
      ) : myLists.length === 0 ? (
        <div className="all-empty list-onboarding">
          <p>{t('lists:noLists')}</p>
          <button className="signout-btn" onClick={handleCreateFirstList}>
            {t('lists:createButton')}
          </button>
        </div>
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

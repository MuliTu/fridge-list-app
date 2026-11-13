import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { Menu, Leaf } from 'lucide-react'
import { DirectionProvider } from '@radix-ui/react-direction'
import { version as appVersion } from '../../package.json'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/AuthContext'
import { ListProvider, useActiveList } from '../hooks/ListContext'
import { useBackgroundAiReview, type BackgroundReview } from '../hooks/useBackgroundAiReview'
import { sanitizeEmailKey } from '../lib/firebase'
import { GroceriesFeedProvider, useGroceriesFeed } from '../hooks/GroceriesFeedContext'
import { GroceryFeedRecovery } from './GroceryFeedRecovery'
import { ListPickerActionsProvider, useListPickerActions } from '../hooks/ListPickerActionsContext'
import { DialogServiceProvider, useDialogService } from '../hooks/DialogServiceContext'
import { useSyncHtmlLangDir } from '../hooks/useSyncHtmlLangDir'
import { UsersManagementModal } from './ListMembersModal'
import ChangelogModal from './ChangelogModal'
import WhatsNewModal from './WhatsNewModal'
import AiAssistantModal from './AiAssistantModal'
import FeedbackModal from './FeedbackModal'
import FeedbackStatusToast from './FeedbackStatusToast'
import OnboardingModal from './OnboardingModal'
import { useCategories } from '../hooks/useCategories'
import { useFeedbackToast } from '../hooks/useFeedbackToast'
import { useStockSuggestion } from '../hooks/useStockSuggestion'
import { useOnboarding } from '../hooks/useOnboarding'
import {
  BoughtItemsPreferenceProvider,
  useBoughtItemsPreference
} from '../hooks/BoughtItemsPreferenceContext'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet'
import { cn } from '../lib/utils'
import { WelcomeScreen } from './WelcomeScreen'
import { WorkspaceNavigation } from './WorkspaceNavigation'
import { DuplicateReviewBell } from './DuplicateReviewBell'
import { BehaviorSettingsProvider, useBehaviorSettings } from '../hooks/BehaviorSettingsContext'
import { SettingsModal } from './SettingsModal'
import { ListPickerManagementActions } from './ListPickerManagementActions'

// Shared Tailwind utility strings for sidebar rows — kept as constants rather than
// repeating the same long className string at every call site below.
const sidebarItemClass =
  "flex w-full cursor-pointer items-center gap-2 rounded-[10px] border-none bg-transparent px-2 py-3 text-start font-['Rubik',sans-serif] text-sm text-foreground hover:bg-accent focus-visible:bg-accent"
const sidebarItemActiveClass = 'bg-accent ring-1 ring-border'
const sidebarSectionLabelClass = 'mx-0.5 mb-0.5 mt-3 text-[11px] text-muted-foreground opacity-80'
const sidebarDividerClass = 'my-2.5 h-px shrink-0 bg-border'
const LocalShoppingProviders = import.meta.env.DEV
  ? lazy(() => import('../dev/LocalShoppingProviders'))
  : null

export default function Layout({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  if (import.meta.env.DEV && import.meta.env.VITE_DEV_MOCK_DATA === 'true' && pathname === '/' && LocalShoppingProviders) {
    return (
      <DirectionProvider dir={i18n.dir()}>
        <DialogServiceProvider>
          <Suspense fallback={<div className="all-empty">טוען נתוני דמו…</div>}>
            <LocalShoppingProviders>
              <ListPickerActionsProvider><BehaviorSettingsBoundary><LayoutContent>{children}</LayoutContent></BehaviorSettingsBoundary></ListPickerActionsProvider>
            </LocalShoppingProviders>
          </Suspense>
        </DialogServiceProvider>
      </DirectionProvider>
    )
  }

  return (
    <DirectionProvider dir={i18n.dir()}>
      <DialogServiceProvider>
        <ListProvider>
          <BoughtItemsPreferenceBoundary>
            <GroceriesFeedProvider>
              <ListPickerActionsProvider>
                <BehaviorSettingsBoundary><LayoutContent>{children}</LayoutContent></BehaviorSettingsBoundary>
              </ListPickerActionsProvider>
            </GroceriesFeedProvider>
          </BoughtItemsPreferenceBoundary>
        </ListProvider>
      </DialogServiceProvider>
    </DirectionProvider>
  )
}

function BehaviorSettingsBoundary({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const scope = user?.email ? `user:${user.email}` : 'local-mock'
  return <BehaviorSettingsProvider key={scope} scope={scope}>{children}</BehaviorSettingsProvider>
}

function BoughtItemsPreferenceBoundary({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return (
    <BoughtItemsPreferenceProvider email={user?.email}>{children}</BoughtItemsPreferenceProvider>
  )
}

function LayoutContent({ children }: { children: ReactNode }) {
  const { settings: behavior } = useBehaviorSettings()
  const { t, i18n } = useTranslation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const currentPage =
    pathname === '/stock'
      ? 'stock'
      : pathname === '/receipts'
        ? 'receipts'
        : pathname === '/recipes'
          ? 'recipes'
          : 'shoppingList'
  useSyncHtmlLangDir()
  const { user, authResolved, onSignIn, onSignOut, authError } = useAuth()
  const {
    myLists,
    listsResolved,
    listsError,
    activeList,
    setActiveListId,
    renameActiveList,
    isOwner,
    canEdit,
    canView
  } = useActiveList()
  const { status, toast, entries, isLoading, hasCurrentSnapshot } = useGroceriesFeed()
  const backgroundReview = useBackgroundAiReview({
    actor: user && 'uid' in user && typeof user.uid === 'string' ? user.uid : null,
    listId: canEdit && activeList ? sanitizeEmailKey(activeList.id) : null,
    entries,
    ready: Boolean(hasCurrentSnapshot),
    language: i18n.language === 'he' ? 'he' : 'en'
  })
  const [openedReview, setOpenedReview] = useState<BackgroundReview | null>(null)
  useEffect(() => {
    setOpenedReview(null)
  }, [backgroundReview.scope])
  const notification = backgroundReview.notification
  const { prompt } = useDialogService()
  const [showSettings, setShowSettings] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [showAiAssistant, setShowAiAssistant] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const { categories } = useCategories()
  // Feedback submission is non-blocking: the modal closes on submit and this drives
  // a transient status toast (pending → success/error) that outlives the modal.
  const {
    toast: feedbackToast,
    submit: submitFeedbackRequest,
    dismiss: dismissFeedbackToast
  } = useFeedbackToast()
  const { enabled: stockSuggestionEnabled, toggle: toggleStockSuggestion } = useStockSuggestion()
  const {
    keepBoughtItemsInCategories,
    isResolved: boughtItemsPreferenceResolved,
    saveError: boughtItemsPreferenceSaveError,
    toggleBoughtItemsPlacement
  } = useBoughtItemsPreference()
  const { actions: listPickerActions } = useListPickerActions()
  const {
    isOpen: onboardingOpen,
    close: closeOnboarding,
    replay: replayOnboarding
  } = useOnboarding(user?.email)

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
    <div
      className={`frame workspace${canView ? ' workspace-signed-in' : ' workspace-public'}`}
      dir={i18n.dir()}
    >
      <a className="skip-link" href="#main-content">
        {t('workspace.skip')}
      </a>
      {canView && (
        <WorkspaceNavigation
          showChef={behavior.showChef}
          householdName={activeList?.name || t('workspace.sharedSpace')}
          remainingCount={isLoading ? null : entries.filter((entry) => !entry.bought).length}
        />
      )}
      <div className="workspace-main">
        <header className="app-header">
          <div className="user-chip">
            {user ? (
              <>
                <DuplicateReviewBell
                  onEnableReview={backgroundReview.offer ? backgroundReview.enable : undefined}
                  reviewing={backgroundReview.running}
                  reviewFailed={backgroundReview.failed}
                  onRetryReview={backgroundReview.retry}
                  onOpenReview={notification ? () => {
                    setShowAiAssistant(false)
                    setOpenedReview(notification)
                    backgroundReview.markRead()
                  } : undefined}
                />
                {/* modal={false}: a fully modal Radix Dialog locks the rest of the page
                  (document.body gets pointer-events: none, and everything outside the
                  dialog gets aria-hidden) for as long as it's open — correct for a true
                  dialog, but it means the hamburger trigger itself becomes unclickable
                  while the sidebar is open, breaking "tap the hamburger again to close"
                  (confirmed directly: elementFromPoint at the trigger's own coordinates
                  resolved to a different element once the lock kicked in). Navigation
                  drawers are the standard exception to full modality for exactly this
                  reason — non-modal still gets Escape-to-close and outside-tap-to-close
                  for free from Radix's own dismissable-layer behavior, it just doesn't
                  lock the rest of the page. */}
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen} modal={false}>
                  <SheetTrigger asChild>
                    <button ref={menuTriggerRef} className="icon-btn menu-trigger-btn" aria-label={t('menu.button')}>
                      <Menu size={19} aria-hidden="true" />
                    </button>
                  </SheetTrigger>
                  <SheetContent closeLabel={t('actions.close')} hideClose>
                  <SheetHeader>
                    <SheetTitle>{t('menu.button')}</SheetTitle>
                  </SheetHeader>

                  {activeList && (
                    <>
                      {myLists.length > 1 && (
                        <div className={sidebarSectionLabelClass}>{t('lists:sectionLabel')}</div>
                      )}
                      {myLists.length > 1 ? (
                        myLists.map((l) => (
                          <button
                            key={l.id}
                            className={cn(
                              sidebarItemClass,
                              l.id === activeList.id && sidebarItemActiveClass
                            )}
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
                        <div className={sidebarItemClass}>📋 {activeList.name}</div>
                      )}
                    </>
                  )}

                  {listPickerActions && (
                    <ListPickerManagementActions
                      actions={listPickerActions}
                      itemClassName={sidebarItemClass}
                      sectionLabelClassName={sidebarSectionLabelClass}
                      dividerClassName={sidebarDividerClass}
                      runAfterSidebarCloses={runAfterSidebarCloses}
                    />
                  )}

                  <div className={sidebarDividerClass} />
                  <button
                    className={sidebarItemClass}
                    onClick={() => runAfterSidebarCloses(() => setShowSettings(true))}
                  >
                    {t('settings.open')}
                  </button>
                  <button
                    className={sidebarItemClass}
                    onClick={() => runAfterSidebarCloses(() => setShowWhatsNew(true))}
                  >
                    {t('menu.viewWhatsNew')}
                  </button>
                  <button
                    className={sidebarItemClass}
                    onClick={() => runAfterSidebarCloses(() => setShowAiAssistant(true))}
                  >
                    {t('menu.viewAiAssistant')}
                  </button>
                  <button
                    className={sidebarItemClass}
                    onClick={() => runAfterSidebarCloses(replayOnboarding)}
                  >
                    {t('menu.viewOnboarding')}
                  </button>
                  <button
                    className={sidebarItemClass}
                    onClick={() => runAfterSidebarCloses(() => setShowChangelog(true))}
                  >
                    {t('menu.viewChangelog')}
                  </button>
                  <button
                    className={sidebarItemClass}
                    onClick={() => runAfterSidebarCloses(() => setShowFeedback(true))}
                  >
                    {t('menu.sendFeedback')}
                  </button>

                  {canEdit && (
                    <>
                      <div className={sidebarDividerClass} />
                      <div className={sidebarSectionLabelClass}>{t('menu.sectionSettings')}</div>
                      <button
                        className={sidebarItemClass}
                        onClick={() => runAfterSidebarCloses(() => setShowMembers(true))}
                      >
                        {t('menu.users')}
                      </button>
                      {isOwner && (
                        <button
                          className={sidebarItemClass}
                          onClick={() => runAfterSidebarCloses(handleRenameList)}
                        >
                          {t('lists:renameMenuItem')}
                        </button>
                      )}
                    </>
                  )}

                  <div className={sidebarDividerClass} />
                  <div className="break-words px-2 pb-2.5 pt-1.5 text-xs text-muted-foreground">
                    {user.displayName || user.email}
                  </div>
                  <div className="mt-auto pt-2.5">
                    <button
                      className={sidebarItemClass}
                      onClick={() => {
                        setSidebarOpen(false)
                        onSignOut()
                      }}
                    >
                      {t('auth.signOut')}
                    </button>
                    <div className="px-2 pt-2 text-xs text-muted-foreground">
                      {t('menu.version', { version: appVersion })}
                    </div>
                  </div>
                  </SheetContent>
                </Sheet>
              </>
            ) : (
              <button className="signout-btn" onClick={onSignIn}>
                {t('auth.signIn')}
              </button>
            )}
          </div>
          {authError && <div className="header-error">{authError}</div>}
          {canView ? (
            <div className="workspace-context">
              <Leaf size={20} aria-hidden="true" />
              <span>{activeList?.name}</span>
              <span className="context-divider">/</span>
              <strong>
                {t(
                  `workspace.nav.${currentPage === 'shoppingList' ? 'shop' : currentPage === 'stock' ? 'kitchen' : currentPage === 'recipes' ? 'cook' : 'receipts'}`
                )}
              </strong>
            </div>
          ) : (
            <h1 className="site-title">
              <span className="brand-mark">
                <Leaf size={23} aria-hidden="true" />
              </span>
              <span className="brand-copy">
                <span>{t('appTitle')}</span>
                <small>{t('design.tagline')}</small>
              </span>
            </h1>
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
        <div
          id="main-content"
          className="workspace-content"
          role={canView ? 'main' : undefined}
          tabIndex={-1}
        >
          {!authResolved ? (
            <div className="all-empty">{t('auth.checkingSession')}</div>
          ) : !user ? (
            <WelcomeScreen onSignIn={onSignIn} />
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
              <div className="page-heading">
                <div>
                  <p className="page-eyebrow">{t(`workspace.eyebrow.${currentPage}`)}</p>
                  <h1>{t(`workspace.title.${currentPage}`)}</h1>
                  <p className="page-description">{t(`design.${currentPage}`)}</p>
                </div>
              </div>
              {toast && <div className="toast">🛒 {toast}</div>}
              <GroceryFeedRecovery />
              {children}

              {onboardingOpen && <OnboardingModal onClose={closeOnboarding} />}
            </>
          )}
        </div>
        {canView && (
          <footer className="workspace-status">
            <span>{status}</span>
            <span>Fridge · v{appVersion}</span>
          </footer>
        )}
      </div>
      {showSettings && (
        <SettingsModal
          categories={categories}
          canEdit={canEdit}
          stockSuggestionEnabled={stockSuggestionEnabled}
          keepBoughtItemsInCategories={keepBoughtItemsInCategories}
          boughtItemsPreferenceResolved={boughtItemsPreferenceResolved}
          boughtItemsPreferenceSaveError={boughtItemsPreferenceSaveError}
          onToggleStockSuggestion={toggleStockSuggestion}
          onToggleBoughtItemsPlacement={toggleBoughtItemsPlacement}
          onClose={() => setShowSettings(false)}
          returnFocusRef={menuTriggerRef}
        />
      )}
      {showMembers && <UsersManagementModal onClose={() => setShowMembers(false)} />}
      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
      {showWhatsNew && <WhatsNewModal onClose={() => setShowWhatsNew(false)} />}
      {showAiAssistant && <AiAssistantModal onClose={() => setShowAiAssistant(false)} />}
      {openedReview && openedReview.scope === backgroundReview.scope && (
        <AiAssistantModal
          initialReview={openedReview}
          isReviewCurrent={backgroundReview.isCurrent}
          onClose={() => setOpenedReview(null)}
        />
      )}
      {showFeedback && (
        <FeedbackModal onClose={() => setShowFeedback(false)} onSubmit={submitFeedbackRequest} />
      )}
      <FeedbackStatusToast toast={feedbackToast} onDismiss={dismissFeedbackToast} />
    </div>
  )
}

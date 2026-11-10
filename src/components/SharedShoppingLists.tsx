import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { discoverShoppingShares, getShoppingShare, shoppingSharingRequest } from '../client/api/shoppingSharing'
import type { ShoppingShareSnapshot, ShoppingShareSummary } from '../modules/shoppingSharing'
import type { GroceryItem } from '../types'
import { useAuth } from '../hooks/AuthContext'
import { useBehaviorSettings } from '../hooks/BehaviorSettingsContext'
import CategorySection from './CategorySection'
import { DEFAULT_CATEGORIES } from '../lib/categories'
import { normalizeName } from '../lib/normalizeName'
import ShoppingListItemRow from './ShoppingListItemRow'
import { UnifiedGrocerySearchAdd } from './UnifiedGrocerySearchAdd'
import { ListMemberAvatars } from './ListSharingBar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'

export function SharedShoppingListsNavigation({ selected }: { selected?: string }) {
  const { t } = useTranslation('lists')
  const { user } = useAuth()
  const [shares, setShares] = useState<ShoppingShareSummary[]>([])
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    setShares([])
    const refresh = async () => {
      try {
        const next = await discoverShoppingShares(controller.signal)
        if (!controller.signal.aborted) { setShares(next); setFailed(false) }
      } catch { if (!controller.signal.aborted) { setShares([]); setFailed(true) } }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 10000)
    }
    if (user?.email) void refresh()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [user?.email])
  if (!selected && !shares.length && !failed) return null
  return <nav className="shared-shopping-navigation" aria-label={t('sharing.sharedWithMe')}>
    <span>{t('sharing.sharedWithMe')}</span>
    {selected && <Link to="/" search={{ shared: undefined }} activeOptions={{ exact: true, includeSearch: true }}>{t('sharing.myLists')}</Link>}
    {shares.map(share => <Link key={share.id} to="/" search={{ shared: share.id }} aria-current={share.id === selected ? 'page' : undefined}>
      {share.name || t('sharing.permanentList')} · {share.owner.displayName}
    </Link>)}
    {failed && <span role="status">{t('sharing.discoveryFailed')}</span>}
  </nav>
}

// A scoped guest never mounts the owner's list provider/feed. This view receives
// only the items returned after server authorization for the selected share.
export default function SharedShoppingList({ shareId }: { shareId: string }) {
  const { t } = useTranslation('lists')
  const { user } = useAuth()
  const { settings } = useBehaviorSettings()
  const [snapshot, setSnapshot] = useState<ShoppingShareSnapshot | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<GroceryItem | null>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLElement>(null)
  const contextKey = JSON.stringify([shareId, user?.email])
  const activeContextRef = useRef(contextKey)
  activeContextRef.current = contextKey
  const mutationEpochRef = useRef(0)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const themeKey = `shared-list-theme:${user?.email || ''}:${shareId}`
  const [theme, setTheme] = useState('blue')
  useEffect(() => {
    try { setTheme(localStorage.getItem(themeKey) || 'blue') } catch { setTheme('blue') }
    setCollapsed(new Set())
  }, [themeKey])
  useEffect(() => {
    const workspace = rootRef.current?.closest<HTMLElement>('.workspace')
    if (!workspace || !snapshot) return
    const previous = workspace.getAttribute('data-shared-theme')
    workspace.setAttribute('data-shared-theme', ['blue', 'purple', 'green'].includes(theme) ? theme : 'blue')
    return () => {
      if (previous === null) workspace.removeAttribute('data-shared-theme')
      else workspace.setAttribute('data-shared-theme', previous)
    }
  }, [snapshot, theme])
  const normalizedSearch = normalizeName(search)
  const filteredItems = (snapshot?.items || []).filter(entry =>
    !normalizedSearch || normalizeName(entry.item).includes(normalizedSearch)
  )
  const groups = new Map<string, GroceryItem[]>()
  for (const entry of filteredItems) {
    const category = entry.category || t('sharing.otherCategory')
    groups.set(category, [...(groups.get(category) || []), entry])
  }
  const categoryPresentation = new Map(snapshot?.categories.map(category => [category.name, category]) || [])
  const orderedGroups = [...groups].sort(([left], [right]) => {
    const leftOrder = categoryPresentation.get(left)?.order ?? Number.MAX_SAFE_INTEGER
    const rightOrder = categoryPresentation.get(right)?.order ?? Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder || left.localeCompare(right)
  })
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    mutationEpochRef.current += 1
    setSnapshot(null)
    setEditing(null)
    setName('')
    setNote('')
    setSearch('')
    setFailed(false)
    const refresh = async () => {
      const refreshEpoch = mutationEpochRef.current
      const stillCurrent = () => !controller.signal.aborted && activeContextRef.current === contextKey && mutationEpochRef.current === refreshEpoch
      try {
        const next = await getShoppingShare(shareId, controller.signal)
        if (stillCurrent()) { setSnapshot(next); setFailed(false) }
      } catch {
        if (stillCurrent()) {
          mutationEpochRef.current += 1
          setSnapshot(null)
          setEditing(null)
          setName('')
          setNote('')
          setSearch('')
          setFailed(true)
        }
      }
      if (!controller.signal.aborted && activeContextRef.current === contextKey) timer = setTimeout(refresh, 5000)
    }
    if (user?.email) void refresh()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [shareId, user?.email])

  const mutate = async (mutation: unknown) => {
    const mutationContext = contextKey
    const mutationEpoch = mutationEpochRef.current
    const stillAuthorized = () => activeContextRef.current === mutationContext && mutationEpochRef.current === mutationEpoch
    try {
      await shoppingSharingRequest({ action: 'mutate', shareId, mutation })
      if (!stillAuthorized()) return
      const next = await getShoppingShare(shareId)
      if (!stillAuthorized()) return
      setSnapshot(next)
      setFailed(false)
    } catch (error) {
      if (stillAuthorized()) {
        if (error instanceof Error && /^(401|403|404)$/.test(error.message)) {
          mutationEpochRef.current += 1
          setSnapshot(null)
          setEditing(null)
          setName('')
          setNote('')
          setSearch('')
        }
        setFailed(true)
      }
      throw error
    }
  }
  const save = async (operation: 'update' | 'delete') => {
    if (!editing || busy) return
    setBusy(true)
    try {
      await mutate({ operation, itemId: editing.key, ...(operation === 'update' ? { item: { name, note } } : {}) })
      setEditing(null)
    } catch { /* Keep the dialog open for retry. */ }
    finally { setBusy(false) }
  }
  return <>
    {snapshot && <SharedShoppingListsNavigation selected={shareId} />}
    <section ref={rootRef} className="shared-shopping-list shopping-primary" aria-label={snapshot?.name || t('sharing.sharedList')}>
      {failed && <p role="alert">{t('sharing.unavailable')}</p>}
      {!snapshot && !failed && <p role="status">{t('sharing.loading')}</p>}
      {snapshot && <>
        <header className="shared-list-banner" aria-label={t('sharing.sharedList')}>
          <div className="shared-list-identity">
            <p className="shared-list-eyebrow">{t('sharing.sharedWithMe')}</p>
            <h2>{snapshot.name || t('sharing.permanentList')}</h2>
            <p>{t('sharing.sharedBy', { name: snapshot.owner.displayName })}</p>
          </div>
          <div className="shared-list-meta">
            <ListMemberAvatars members={[snapshot.owner, ...snapshot.members]} />
            <label className="shared-theme-picker"><span className="shared-theme-label">{t('sharing.theme')}</span>
              <select value={theme} onChange={event => {
                const next = event.target.value
                setTheme(next)
                try { localStorage.setItem(themeKey, next) } catch { /* Session choice still applies. */ }
              }}>
                {['blue', 'purple', 'green'].map(color => <option key={color} value={color}>{t(`sharing.themeColors.${color}`)}</option>)}
              </select>
            </label>
          </div>
        </header>
        <UnifiedGrocerySearchAdd
          listId={shareId}
          entries={snapshot.items}
          canEdit
          localOnly
          addContext={{
            categories: [],
            onAdd: async name => mutate({ operation: 'add', item: { name } })
          }}
          onQueryChange={setSearch}
          onSemanticMatchesChange={() => {}}
          onMatch={async () => { throw new Error('Semantic matching is unavailable for shared lists.') }}
        />
        <div className="shared-list-categories">
          {orderedGroups.map(([category, items]) => {
            const presentation = categoryPresentation.get(category) || Object.values(DEFAULT_CATEGORIES).find(entry => entry.name === category)
            return <CategorySection key={category} name={category} icon={presentation?.icon || '📌'} color={presentation?.color || '#94a3b8'}
              uncheckedCount={items.filter(entry => !entry.bought).length}
              collapsed={normalizedSearch ? false : collapsed.has(category)} onToggle={() => setCollapsed(previous => {
                const next = new Set(previous)
                if (next.has(category)) next.delete(category)
                else next.add(category)
                return next
              })}>
              {items.map(entry => <ShoppingListItemRow key={entry.key} entry={entry} canEdit delayPurchase
                showCountdown={settings.showCountdown} purchaseGesture={settings.purchaseGesture}
                onCheckedChange={() => { void mutate({ operation: 'update', itemId: entry.key, item: { bought: !entry.bought } }).catch(() => {}) }}
                onUrgencyChange={urgency => mutate({ operation: 'update', itemId: entry.key, item: { urgency } })}
                onEditClick={() => { setEditing(entry); setName(entry.item); setNote(entry.note || '') }} />)}
            </CategorySection>
          })}
        </div>
        {!snapshot.items.length && <p>{t('sharing.empty')}</p>}
        {snapshot.items.length > 0 && filteredItems.length === 0 && normalizedSearch && (
          <p role="status">{t('shoppingList:search.noResults', { query: search.trim() })}</p>
        )}
      </>}
    </section>
    <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}><DialogContent>
      <DialogHeader><DialogTitle>{t('sharing.editItem')}</DialogTitle></DialogHeader>
      <form onSubmit={event => { event.preventDefault(); void save('update') }} className="sharing-edit-form">
        <label>{t('sharing.itemName')}<Input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
        <label>{t('sharing.itemNote')}<Input maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></label>
        <Button type="submit" disabled={busy}>{t('sharing.save')}</Button>
        <Button type="button" variant="destructive" disabled={busy} onClick={() => save('delete')}>{t('sharing.delete')}</Button>
      </form>
    </DialogContent></Dialog>
  </>
}

import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { discoverShoppingShares, getShoppingShare, shoppingSharingRequest } from '../client/api/shoppingSharing'
import type { ShoppingShareSnapshot, ShoppingShareSummary } from '../modules/shoppingSharing'
import type { GroceryItem } from '../types'
import { useAuth } from '../hooks/AuthContext'
import { useBehaviorSettings } from '../hooks/BehaviorSettingsContext'
import ShoppingListItemRow from './ShoppingListItemRow'
import QuickAddBar from './QuickAddBar'
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
    {selected && <Link to="/" search={{}}>{t('sharing.myLists')}</Link>}
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
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    setSnapshot(null)
    setEditing(null)
    setFailed(false)
    const refresh = async () => {
      try {
        const next = await getShoppingShare(shareId, controller.signal)
        if (!controller.signal.aborted) { setSnapshot(next); setFailed(false) }
      } catch {
        if (!controller.signal.aborted) { setSnapshot(null); setEditing(null); setFailed(true) }
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 5000)
    }
    void refresh()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [shareId, user?.email])

  const mutate = async (mutation: unknown) => {
    try {
      await shoppingSharingRequest({ action: 'mutate', shareId, mutation })
      setSnapshot(await getShoppingShare(shareId))
      setFailed(false)
    } catch (error) { setFailed(true); throw error }
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
    <SharedShoppingListsNavigation selected={shareId} />
    <section className="shared-shopping-list" aria-label={snapshot?.name || t('sharing.sharedList')}>
      {failed && <p role="alert">{t('sharing.unavailable')}</p>}
      {!snapshot && !failed && <p role="status">{t('sharing.loading')}</p>}
      {snapshot && <>
        <div className="list-sharing-bar"><h2>{snapshot.name || t('sharing.permanentList')}</h2><ListMemberAvatars members={[snapshot.owner, ...snapshot.members]} /></div>
        <p className="text-sm text-muted-foreground">{t('sharing.sharedBy', { name: snapshot.owner.displayName })}</p>
        <QuickAddBar aiAvailable={false} onAdd={async name => mutate({ operation: 'add', item: { name } })} />
        <ul className="item-list">
          {snapshot.items.map(entry => <ShoppingListItemRow key={entry.key} entry={entry} canEdit delayPurchase
            showCountdown={settings.showCountdown} purchaseGesture={settings.purchaseGesture}
            onCheckedChange={() => { void mutate({ operation: 'update', itemId: entry.key, item: { bought: !entry.bought } }).catch(() => {}) }}
            onUrgencyChange={urgency => mutate({ operation: 'update', itemId: entry.key, item: { urgency } })}
            onEditClick={() => { setEditing(entry); setName(entry.item); setNote(entry.note || '') }} />)}
        </ul>
        {!snapshot.items.length && <p>{t('sharing.empty')}</p>}
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

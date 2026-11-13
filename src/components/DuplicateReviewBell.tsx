import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { createDuplicateReviewApiClient, type DuplicateReviewAction, type DuplicateReviewFinding } from '../client/api/duplicateReview'
import { getCurrentUserIdToken, sanitizeEmailKey } from '../lib/firebase'
import { useActiveList } from '../hooks/ListContext'
import { useDialogService } from '../hooks/DialogServiceContext'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
const api = createDuplicateReviewApiClient({ getIdToken: getCurrentUserIdToken })
type DuplicateReviewBellProps = {
  reviewing?: boolean
  reviewFailed?: boolean
  onRetryReview?: () => void
  onEnableReview?: () => void
  onOpenReview?: () => void
}

export function DuplicateReviewBell({ reviewing, reviewFailed, onRetryReview, onOpenReview, onEnableReview }: DuplicateReviewBellProps = {}) {
  const { t, i18n } = useTranslation('common'); const { myLists } = useActiveList(); const { confirm } = useDialogService(); const [open, setOpen] = useState(false); const [findings, setFindings] = useState<DuplicateReviewFinding[]>([]); const [loading, setLoading] = useState(false); const [loadError, setLoadError] = useState(false); const [actionError, setActionError] = useState(false); const [busyId, setBusyId] = useState<string | null>(null)
  const listIds = Array.from(new Set(myLists.map((list) => sanitizeEmailKey(list.id)))); const listIdentity = listIds.slice().sort().join('\u0000')
  const request = useRef<{ controller: AbortController; outcomes: Array<{ finding: DuplicateReviewFinding; action: DuplicateReviewAction }> } | null>(null)
  const reconcile = (entries: DuplicateReviewFinding[], finding: DuplicateReviewFinding, action: DuplicateReviewAction) => action.action === 'read'
    ? entries.map((entry) => entry.listId === finding.listId && entry.id === finding.id ? { ...entry, unread: false, status: 'read' as const } : entry)
    : entries.filter((entry) => entry.listId !== finding.listId || entry.id !== finding.id)
  const membership = useRef({ identity: listIdentity, generation: 0 })
  if (membership.current.identity !== listIdentity) membership.current = { identity: listIdentity, generation: membership.current.generation + 1 }
  const busyAction = useRef(0)
  const refresh = useCallback(() => {
    request.current?.controller.abort()
    const controller = new AbortController()
    const pending = { controller, outcomes: [] as Array<{ finding: DuplicateReviewFinding; action: DuplicateReviewAction }> }
    request.current = pending
    if (!listIdentity) { setLoading(false); setLoadError(false); return }
    setLoading(true)
    Promise.all(listIdentity.split('\u0000').map((id) => api.list(id, controller.signal)))
      .then((results) => { if (!controller.signal.aborted) { setFindings(pending.outcomes.reduce((entries, outcome) => reconcile(entries, outcome.finding, outcome.action), results.flatMap((result) => result.findings)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))); setLoadError(false) } })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true) })
      .finally(() => { if (request.current === pending) request.current = null; if (!controller.signal.aborted) setLoading(false) })
  }, [listIdentity])
  useEffect(() => {
    setFindings([])
    setBusyId(null)
    setLoadError(false)
    setActionError(false)
    refresh()
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 60000)
    return () => { request.current?.controller.abort(); window.removeEventListener('focus', onFocus); window.clearInterval(timer) }
  }, [refresh])
  const unread = findings.filter((finding) => finding.unread).length + Number(Boolean(onOpenReview))
  const apply = async (finding: DuplicateReviewFinding, action: DuplicateReviewAction, generation = membership.current.generation) => {
    if (generation !== membership.current.generation) return
    const actionId = ++busyAction.current
    setBusyId(`${finding.listId}:${finding.id}`)
    setActionError(false)
    try {
      await api.act(finding.listId, finding.id, action)
      if (generation !== membership.current.generation) return
      if (request.current && !request.current.controller.signal.aborted) request.current.outcomes.push({ finding, action })
      setFindings((current) => reconcile(current, finding, action))
    } catch {
      if (generation === membership.current.generation) setActionError(true)
    } finally {
      if (generation === membership.current.generation && actionId === busyAction.current) setBusyId(null)
    }
  }
  const handleOpenChange = (next: boolean) => { setOpen(next); if (next) { if (!loadError && findings.length === 0) refresh(); findings.filter((f) => f.unread).forEach((f) => { void apply(f, { action: 'read' }) }) } }
  const deleteOne = async (finding: DuplicateReviewFinding, item: { id: string; name: string }) => {
    const generation = membership.current.generation
    if (await confirm(t('duplicateReview.deleteConfirm', { name: item.name }))) await apply(finding, { action: 'delete_one', itemId: item.id }, generation)
  }
  return <>
    {reviewing && <span role="status" className="flex items-center gap-1 text-xs text-muted-foreground">
      <LoaderCircle size={14} className="shrink-0 motion-safe:animate-spin" aria-hidden="true" />
      {t('duplicateReview.background.progress')}
    </span>}
    <Dialog open={open} onOpenChange={handleOpenChange}><DialogTrigger asChild><button className="icon-btn duplicate-review-trigger" aria-label={loadError || actionError || reviewFailed ? `${t('duplicateReview.open')}: ${t('duplicateReview.error')}` : t('duplicateReview.open')}><Bell size={19} aria-hidden="true" />{(loadError || actionError || reviewFailed) && <span className="absolute start-0 top-0 rounded-full bg-destructive px-1 text-xs text-white" aria-label={t('duplicateReview.error')}>!</span>}{unread > 0 && <span className="duplicate-review-badge" aria-label={t('duplicateReview.unread', { count: unread })}>{unread > 99 ? '99+' : unread}</span>}</button></DialogTrigger><DialogContent className="sm:max-w-[560px]" closeLabel={t('actions.close')}><DialogHeader><DialogTitle>{t('duplicateReview.title')}</DialogTitle><DialogDescription>{t('duplicateReview.description')}</DialogDescription></DialogHeader>
    {onEnableReview && <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{t('duplicateReview.background.notice')}</p>
      <Button variant="secondary" onClick={() => { onEnableReview(); setOpen(false) }}>
        {t('duplicateReview.background.enable')}
      </Button>
    </div>}
    {onOpenReview && <Button variant="secondary" onClick={() => { setOpen(false); onOpenReview() }}>
      {t('duplicateReview.background.open')}
    </Button>}
    {reviewFailed && <div role="alert" className="space-y-2">
      <p className="text-destructive">{t('duplicateReview.background.failed')}</p>
      <Button variant="secondary" size="sm" onClick={onRetryReview}>{t('duplicateReview.retry')}</Button>
    </div>}
    {loading && <p role="status">{t('duplicateReview.loading')}</p>}{loadError && <div role="alert"><p className="text-destructive">{t('duplicateReview.error')}</p><Button size="sm" variant="secondary" onClick={refresh}>{t('duplicateReview.retry')}</Button></div>}{actionError && <p role="alert" className="text-destructive">{t('duplicateReview.error')}</p>}{!loading && !loadError && !actionError && !onOpenReview && !reviewFailed && findings.length === 0 && <p>{t('duplicateReview.empty')}</p>}<div className="flex flex-col gap-3">{findings.map((finding) => <article key={`${finding.listId}:${finding.id}`} className="rounded-xl border border-border bg-input/40 p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="m-0 text-xs text-muted-foreground">{finding.listName} · {t(`duplicateReview.status.${finding.status}`)}</p><h3 className="m-0 mt-1 text-base">{finding.items[0].name} · {finding.items[1].name}</h3></div><time className="text-xs text-muted-foreground" dateTime={finding.createdAt}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(finding.createdAt))}</time></div><p className="my-2 text-sm text-muted-foreground">{t(`duplicateReview.reasons.${finding.reason}`)} · {Math.round(finding.score * 100)}%</p><p className="my-2 text-xs text-muted-foreground">{t('duplicateReview.notConfirmed')}</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={busyId === `${finding.listId}:${finding.id}`} onClick={() => void apply(finding, { action: 'keep_both' })}>{t('duplicateReview.keepBoth')}</Button>{finding.items.map((item) => <Button key={item.id} size="sm" variant="destructive" disabled={busyId === `${finding.listId}:${finding.id}`} onClick={() => void deleteOne(finding, item)}>{t('duplicateReview.deleteOne', { name: item.name })}</Button>)}<Button size="sm" variant="ghost" disabled={busyId === `${finding.listId}:${finding.id}`} onClick={() => void apply(finding, { action: 'dismiss' })}>{t('duplicateReview.dismiss')}</Button></div></article>)}</div></DialogContent></Dialog>
  </>
}

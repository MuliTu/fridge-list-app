import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AiAssistantApiError, analyzeWithAi } from '../client/api/aiAssistant'
import { buildAiAssistantRequest } from '../client/api/buildAiAssistantRequest'
import { useAuth } from '../hooks/AuthContext'
import { useDialogService } from '../hooks/DialogServiceContext'
import { useActiveList, useListApi } from '../hooks/ListContext'
import { normalizeName } from '../lib/normalizeName'
import type { AiAssistantRequest, AiAssistantResult, AiListReviewResult } from '../modules/ai'
import type { GroceryItem } from '../types'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'

type AnalysisMode = AiAssistantRequest['mode']
type ReviewApplyResult = {
  removed: number
  renamed: number
  skipped: number
  removedKeys: string[]
  renamedKeys: string[]
  skippedKeys: string[]
}

export const aiErrorExplanationKey = (code: string) => {
  if (code === 'AI_TIMEOUT') return 'ai:errorExplanation.timeout'
  if (code === 'AI_INVALID_RESPONSE') return 'ai:errorExplanation.invalidResponse'
  if (code === 'NOT_CONFIGURED') return 'ai:errorExplanation.notConfigured'
  return 'ai:errorExplanation.unavailable'
}

export const uniqueSuggestedListName = (baseName: string, existingNames: string[]): string => {
  const existing = new Set(existingNames.map(normalizeName))
  if (!existing.has(normalizeName(baseName))) return baseName
  let suffix = 2
  while (existing.has(normalizeName(`${baseName} (${suffix})`))) suffix += 1
  return `${baseName} (${suffix})`
}

export default function AiAssistantModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation(['ai', 'common'])
  const { user } = useAuth()
  const { activeList } = useActiveList()
  const listApi = useListApi()
  const { confirm } = useDialogService()
  const [mode, setMode] = useState<AnalysisMode | null>(null)
  const [result, setResult] = useState<AiAssistantResult | null>(null)
  const [contextItems, setContextItems] = useState<GroceryItem[]>([])
  const [selectedDuplicateGroups, setSelectedDuplicateGroups] = useState<Set<number>>(new Set())
  const [selectedRenameKeys, setSelectedRenameKeys] = useState<Set<string>>(new Set())
  const [ignoredCorrections, setIgnoredCorrections] = useState(0)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<AiAssistantApiError | Error | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [reviewApplyResult, setReviewApplyResult] = useState<ReviewApplyResult | null>(null)

  const runAnalysis = async (nextMode: AnalysisMode) => {
    setMode(nextMode)
    setResult(null)
    setError(null)
    setStatus(null)
    setReviewApplyResult(null)
    setLoading(true)
    try {
      const context = await listApi.getAiRetrievalContext()
      setContextItems(context.items)
      const response = await analyzeWithAi(buildAiAssistantRequest({
        mode: nextMode,
        language: i18n.language === 'en' ? 'en' : 'he',
        householdName: activeList?.name || t('ai:title'),
        context
      }))
      setResult(response.result)
      setIgnoredCorrections(response.ignoredCorrectionCount)
      if (response.result.mode === 'list_review') {
        setSelectedDuplicateGroups(new Set(response.result.duplicates.map((_, index) => index)))
        setSelectedRenameKeys(new Set(response.result.renames.map((rename) => rename.key)))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('Unknown AI request failure'))
    } finally {
      setLoading(false)
    }
  }

  const createProposedList = async () => {
    if (!result || result.mode !== 'insights' || !result.proposedList) return
    const listName = uniqueSuggestedListName(
      result.proposedList.name,
      contextItems.flatMap((item) => (item.list_name ? [item.list_name] : []))
    )
    if (!(await confirm(t('ai:createConfirm', { listName, count: result.proposedList.items.length })))) return
    setApplying(true)
    setStatus(null)
    try {
      const created = await listApi.createSuggestedList(listName, result.proposedList.items, user)
      setStatus(t('ai:createSuccess', { listName, count: created.created }))
    } catch {
      setStatus(t('ai:applyError'))
    } finally {
      setApplying(false)
    }
  }

  const applyReview = async () => {
    if (!result || result.mode !== 'list_review') return
    const removals = result.duplicates
      .filter((_, index) => selectedDuplicateGroups.has(index))
      .flatMap((group) =>
        group.removeKeys.flatMap((key) => {
          const item = contextItems.find((candidate) => candidate.key === key)
          return item ? [{ key, expectedName: item.item }] : []
        })
      )
    const renames = result.renames
      .filter((rename) => selectedRenameKeys.has(rename.key))
      .map((rename) => ({ key: rename.key, expectedName: rename.currentName, name: rename.suggestedName }))
    if (removals.length + renames.length === 0) return
    if (!(await confirm(t('ai:reviewConfirm', { removeCount: removals.length, renameCount: renames.length })))) return

    setApplying(true)
    setStatus(null)
    try {
      const applied = await listApi.applyAiListReview({ removals, renames }, user)
      setReviewApplyResult(applied)
      setStatus(t('ai:reviewSuccess', applied))
    } catch {
      setStatus(t('ai:applyError'))
    } finally {
      setApplying(false)
    }
  }

  const itemName = (key: string) => contextItems.find((item) => item.key === key)?.item || key
  const review = result?.mode === 'list_review' ? result as AiListReviewResult : null
  const selectedRemovalCount = review?.duplicates
    .filter((_, index) => selectedDuplicateGroups.has(index))
    .reduce((count, group) => count + group.removeKeys.length, 0) ?? 0
  const resultForKeys = (keys: string[]) => {
    if (!reviewApplyResult) return null
    const applied = keys.filter((key) =>
      reviewApplyResult.removedKeys.includes(key) || reviewApplyResult.renamedKeys.includes(key)
    ).length
    const skipped = keys.length - applied
    return `${skipped > 0 ? '⚠' : '✓'} ${t('ai:review.itemResult', { applied, skipped })}`
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !applying && onClose()}>
      <DialogContent
        closeLabel={t('common:actions.close')}
        className="max-h-[90vh] overflow-y-auto sm:max-w-[620px]"
      >
        <DialogHeader>
          <DialogTitle>{t('ai:title')}</DialogTitle>
          <DialogDescription>{t('ai:description')}</DialogDescription>
        </DialogHeader>

        {!mode && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Button className="h-auto min-h-24 flex-col whitespace-normal px-4 py-4" onClick={() => runAnalysis('insights')}>
              <span className="text-base">✨ {t('ai:insights.title')}</span>
              <span className="text-xs font-normal opacity-80">{t('ai:insights.description')}</span>
            </Button>
            <Button variant="secondary" className="h-auto min-h-24 flex-col whitespace-normal px-4 py-4" onClick={() => runAnalysis('list_review')}>
              <span className="text-base">🔎 {t('ai:review.title')}</span>
              <span className="text-xs font-normal opacity-80">{t('ai:review.description')}</span>
            </Button>
          </div>
        )}

        {loading && <p role="status" className="py-8 text-center text-sm text-muted-foreground">{t('ai:analyzing')}</p>}
        {error && (
          <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">
            <p className="m-0">{t('ai:loadError')}</p>
            <p className="mb-0 mt-2 break-words font-mono text-xs text-muted-foreground">
              {error instanceof AiAssistantApiError
                ? t('ai:errorDetails', { code: error.code, status: error.status, message: error.message })
                : t('ai:errorDetails', { code: 'CLIENT_ERROR', status: '—', message: error.message })}
            </p>
            <p className="mb-0 mt-2 text-xs text-muted-foreground">
              {t(aiErrorExplanationKey(error instanceof AiAssistantApiError ? error.code : 'CLIENT_ERROR'))}
            </p>
            <Button className="mt-3" size="sm" onClick={() => mode && runAnalysis(mode)}>{t('ai:retry')}</Button>
          </div>
        )}

        {result?.mode === 'insights' && (
          <div className="grid gap-4">
            <p className="m-0 text-xs text-muted-foreground">{t('ai:historyCoverage')}</p>
            {ignoredCorrections > 0 && <p className="m-0 text-xs text-muted-foreground">{t('ai:ignoredCorrections', { count: ignoredCorrections })}</p>}
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t('ai:insights.summary')}</h3>
              {result.summary.length ? <ul className="m-0 list-disc ps-5">{result.summary.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="m-0 text-sm text-muted-foreground">{t('ai:noSuggestions')}</p>}
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t('ai:insights.nextSteps')}</h3>
              <ul className="m-0 list-disc ps-5">{result.nextSteps.map((line) => <li key={line}>{line}</li>)}</ul>
            </section>
            {result.proposedList && (
              <section className="rounded-xl border border-border p-4">
                <h3 className="m-0 text-sm font-semibold">{t('ai:insights.proposedList', { listName: result.proposedList.name })}</h3>
                <ul className="mb-0 mt-2 list-disc ps-5 text-sm">
                  {result.proposedList.items.map((item) => <li key={item.name}><span className="font-medium">{item.name}</span> · {item.reason}</li>)}
                </ul>
                <Button className="mt-3" size="sm" onClick={createProposedList} disabled={applying || result.proposedList.items.length === 0}>
                  {applying ? t('common:actions.adding') : t('ai:createList')}
                </Button>
              </section>
            )}
          </div>
        )}

        {review && (
          <div className="grid gap-4">
            <p className="m-0 text-xs text-muted-foreground">{t('ai:review.reviewBeforeApply')}</p>
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t('ai:review.duplicates')}</h3>
              {review.duplicates.length === 0 ? <p className="m-0 text-sm text-muted-foreground">{t('ai:noSuggestions')}</p> : review.duplicates.map((group, index) => (
                <label key={`${group.keepKey}-${index}`} className="mb-2 flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm">
                  <Checkbox checked={selectedDuplicateGroups.has(index)} onCheckedChange={() => setSelectedDuplicateGroups((current) => { const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next })} disabled={applying || Boolean(reviewApplyResult)} />
                  <span><span className="font-medium">{t('ai:review.keep', { name: itemName(group.keepKey) })}</span><br />{t('ai:review.remove', { names: group.removeKeys.map(itemName).join(', ') })}<br /><span className="text-xs text-muted-foreground">{group.reason}</span>{reviewApplyResult && selectedDuplicateGroups.has(index) && <><br /><span className="text-xs font-medium text-primary">{resultForKeys(group.removeKeys)}</span></>}</span>
                </label>
              ))}
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t('ai:review.renames')}</h3>
              {review.renames.length === 0 ? <p className="m-0 text-sm text-muted-foreground">{t('ai:noSuggestions')}</p> : review.renames.map((rename) => (
                <label key={rename.key} className="mb-2 flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm">
                  <Checkbox checked={selectedRenameKeys.has(rename.key)} onCheckedChange={() => setSelectedRenameKeys((current) => { const next = new Set(current); next.has(rename.key) ? next.delete(rename.key) : next.add(rename.key); return next })} disabled={applying || Boolean(reviewApplyResult)} />
                  <span><span className="font-medium">{rename.currentName} → {rename.suggestedName}</span><br /><span className="text-xs text-muted-foreground">{rename.reason}</span>{reviewApplyResult && selectedRenameKeys.has(rename.key) && <><br /><span className="text-xs font-medium text-primary">{resultForKeys([rename.key])}</span></>}</span>
                </label>
              ))}
            </section>
            <Button onClick={applyReview} disabled={applying || Boolean(reviewApplyResult) || selectedRemovalCount + selectedRenameKeys.size === 0}>
              {applying ? t('ai:applying') : t('ai:applySelected', { count: selectedRemovalCount + selectedRenameKeys.size })}
            </Button>
          </div>
        )}

        {status && <p role="status" className="m-0 rounded-xl border border-border p-3 text-sm">{status}</p>}
        {mode && !loading && (
          <DialogFooter>
            <Button variant="secondary" onClick={() => { setMode(null); setResult(null); setError(null); setStatus(null); setReviewApplyResult(null) }} disabled={applying}>{t('ai:back')}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

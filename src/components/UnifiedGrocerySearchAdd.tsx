import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { enrichItemsWithAi } from '../client/api/aiItemEnrichment'
import type { SemanticGroceryMatchResult } from '../client/api/groceries'
import { useProductIntegrityGuardian } from '../hooks/useProductIntegrityGuardian'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { normalizeName } from '../lib/normalizeName'
import type { Category, GroceryItem } from '../types'

type AddContext = {
  categories: Category[]
  onAdd: (name: string, category?: string) => Promise<unknown> | PromiseLike<unknown>
  onAddCategory?: (category: {
    name: string
    color: string
    icon?: string
    order?: number
  }) => Promise<unknown> | PromiseLike<unknown>
}

type UnifiedGrocerySearchAddProps = {
  listId: string
  guardianListName?: string | null
  entries: GroceryItem[]
  canEdit: boolean
  localOnly?: boolean
  addContext: AddContext
  onQueryChange: (query: string) => void
  onSemanticMatchesChange: (filter: {
    listId: string
    query: string
    matchIds: string[]
  }) => void
  onMatch: (listId: string, query: string, signal?: AbortSignal) => Promise<SemanticGroceryMatchResult>
}

type SemanticState =
  | { phase: 'idle' | 'pending'; query: string }
  | { phase: 'ready'; query: string; result: SemanticGroceryMatchResult }
  | { phase: 'error'; query: string }

const MAX_BATCH_ITEMS = 100
const MAX_ITEM_NAME_LENGTH = 100

class StaleSubmissionError extends Error {
  constructor() {
    super('stale submission')
    this.name = 'StaleSubmissionError'
  }
}

const localSemanticResult = (
  entries: GroceryItem[],
  query: string
): SemanticGroceryMatchResult => {
  const normalized = normalizeName(query)
  const exact = entries.filter((entry) => normalizeName(entry.item) === normalized)
  const similar = exact.length > 0 ? [] : entries.filter((entry) => {
    const candidate = normalizeName(entry.item)
    return candidate.includes(normalized) || normalized.includes(candidate)
  })
  const candidates = exact.length > 0 ? exact : similar
  const classification = exact.length > 0 ? 'exact' : similar.length > 0 ? 'similar' : 'distinct'
  return {
    status: 'ok',
    evaluatedName: query,
    snapshotId: '0'.repeat(64),
    classification,
    matches: candidates.map((entry) => ({
      id: entry.key,
      name: entry.item,
      category: entry.category,
      bought: entry.bought,
      hidden: false,
      collapsed: false,
      matchType: exact.length > 0 ? 'exact' : 'similar'
    })),
    candidateCount: entries.length
  }
}

export function UnifiedGrocerySearchAdd({
  listId,
  guardianListName,
  entries,
  canEdit,
  localOnly = false,
  addContext,
  onQueryChange,
  onSemanticMatchesChange,
  onMatch: _onMatch
}: UnifiedGrocerySearchAddProps) {
  const { t, i18n } = useTranslation()
  const [value, setValue] = useState('')
  const [semantic, setSemantic] = useState<SemanticState>({ phase: 'idle', query: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submissionIdentity = useRef(0)
  const submissionController = useRef<AbortController | null>(null)
  const emittedFilterIdentity = useRef('')
  const mounted = useRef(true)

  const trimmed = value.trim()
  const normalized = normalizeName(trimmed)
  const isBatch = trimmed.includes(',')
  const localMatches = isBatch || !normalized
    ? []
    : entries.filter((entry) => normalizeName(entry.item).includes(normalized))
  const exactExisting = localMatches.find((entry) => normalizeName(entry.item) === normalized)
  const guardian = useProductIntegrityGuardian(!localOnly && canEdit && guardianListName !== undefined &&
    trimmed && !isBatch && !exactExisting && !saving ? {
      listId,
      query: trimmed,
      guardian: { operation: 'add', listName: guardianListName, language: i18n.language === 'en' ? 'en' : 'he' }
    } : null)
  const confirmedId = guardian?.action === 'use_existing' &&
    entries.some(({ key }) => key === guardian.match.existingItemId)
    ? guardian.match.existingItemId
    : null

  useEffect(() => {
    onQueryChange(isBatch ? '' : trimmed)
  }, [isBatch, onQueryChange, trimmed])

  const semanticReady = semantic.phase === 'ready' && semantic.query === trimmed
  const semanticMatchIds = confirmedId ? [confirmedId] : semanticReady && semantic.result.status === 'ok' &&
    semantic.result.classification !== 'distinct'
    ? semantic.result.matches.map((match) => match.id)
    : []

  useEffect(() => {
    const filter = {
      listId,
      query: isBatch ? '' : trimmed,
      matchIds: semanticMatchIds
    }
    const identity = `${filter.listId}\u0000${filter.query}\u0000${filter.matchIds.join('\u0000')}`
    if (emittedFilterIdentity.current === identity) return
    emittedFilterIdentity.current = identity
    onSemanticMatchesChange(filter)
  }, [isBatch, listId, onSemanticMatchesChange, semanticMatchIds, trimmed])

  const invalidateSubmission = () => {
    submissionIdentity.current += 1
    submissionController.current?.abort()
    submissionController.current = null
  }

  useEffect(() => {
    mounted.current = true
    invalidateSubmission()
    setSaving(false)
    return () => {
      mounted.current = false
      invalidateSubmission()
    }
  }, [listId])

  useEffect(() => {
    if (!trimmed || isBatch) {
      setSemantic({ phase: 'idle', query: trimmed })
      return
    }
    setSemantic({ phase: 'ready', query: trimmed, result: localSemanticResult(entries, trimmed) })
  }, [entries, isBatch, trimmed])

  const prepareAndAdd = async (names: string[], assertCurrent: () => void) => {
    const items = names.map((name, index) => ({ id: `unified-add-${index}`, name }))
    const preparedItems = localOnly ? [] : (await enrichItemsWithAi({
      language: i18n.language === 'en' ? 'en' : 'he',
      categories: addContext.categories.length
        ? addContext.categories.map((category) => category.name)
        : [OTHER_CATEGORY_NAME],
      items
    }).catch(() => ({ items: [] }))).items
    assertCurrent()
    const suggestions = new Map(preparedItems.map((item) => [item.id, item] as const))
    const categoryNames = new Map(
      addContext.categories.map((category) => [normalizeName(category.name), category.name])
    )
    let nextOrder = addContext.categories.reduce(
      (maximum, category) => Math.max(maximum, category.order ?? 0), 0
    ) + 1

    for (let index = 0; index < items.length; index += 1) {
      const suggestion = suggestions.get(items[index].id)
      try {
        let category = suggestion?.category ?? OTHER_CATEGORY_NAME
        const known = categoryNames.get(normalizeName(category))
        if (known) category = known
        else if (suggestion && addContext.onAddCategory) {
          assertCurrent()
          await addContext.onAddCategory({
            name: category,
            color: '#94a3b8',
            icon: '📌',
            order: nextOrder
          })
          assertCurrent()
          categoryNames.set(normalizeName(category), category)
          nextOrder += 1
        }
        assertCurrent()
        await addContext.onAdd(suggestion?.correctedName ?? items[index].name, category)
        assertCurrent()
      } catch (cause) {
        if (!(cause instanceof StaleSubmissionError) && mounted.current) {
          setValue(names.slice(index).join(', '))
        }
        throw cause
      }
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!trimmed || saving || !canEdit) return
    const names = trimmed.split(',').map((name) => name.trim()).filter(Boolean)
    if (names.length > MAX_BATCH_ITEMS) {
      setError(t('shoppingList:quickAdd.tooManyItems', { max: MAX_BATCH_ITEMS }))
      return
    }
    if (names.some((name) => name.length > MAX_ITEM_NAME_LENGTH)) {
      setError(t('shoppingList:quickAdd.itemTooLong', { max: MAX_ITEM_NAME_LENGTH }))
      return
    }

    setSaving(true)
    setError(null)
    const identity = ++submissionIdentity.current
    const submittedListId = listId
    const controller = new AbortController()
    submissionController.current?.abort()
    submissionController.current = controller
    const assertCurrent = () => {
      if (!mounted.current || submissionIdentity.current !== identity || listId !== submittedListId) {
        throw new StaleSubmissionError()
      }
    }
    try {
      if (names.length === 1) {
        if (exactExisting) return
        await prepareAndAdd(names, assertCurrent)
      } else {
        await prepareAndAdd(names, assertCurrent)
      }
      assertCurrent()
      setValue('')
    } catch (cause) {
      if (cause instanceof StaleSubmissionError || controller.signal.aborted) return
      const message = cause instanceof Error ? cause.message : String(cause)
      if (mounted.current && submissionIdentity.current === identity) {
        setError(t('shoppingList:quickAdd.failed', { message }))
      }
    } finally {
      if (mounted.current && submissionIdentity.current === identity) {
        setSaving(false)
        submissionController.current = null
      }
    }
  }

  const canCreate = canEdit && Boolean(trimmed) && !exactExisting

  return (
    <div className="unified-grocery-add">
      <form className="unified-grocery-form" onSubmit={handleSubmit}>
        <Search aria-hidden="true" size={18} />
        <label className="sr-only" htmlFor="unified-grocery-input">
          {t('shoppingList:unifiedAdd.label')}
        </label>
        <input
          id="unified-grocery-input"
          value={value}
          onChange={(event) => {
            invalidateSubmission()
            setSaving(false)
            setValue(event.target.value)
            setError(null)
          }}
          placeholder={t('shoppingList:unifiedAdd.placeholder')}
          autoComplete="off"
          aria-describedby="unified-grocery-status"
        />
        {value && (
          <button
            type="button"
            className="unified-grocery-clear"
            onClick={() => {
              invalidateSubmission()
              setSaving(false)
              setValue('')
            }}
            aria-label={t('shoppingList:search.clear')}
          >
            <X aria-hidden="true" size={16} />
          </button>
        )}
        <button type="submit" disabled={saving || (!isBatch && !canCreate)}>
          <Plus aria-hidden="true" size={17} />
          <span>{saving ? t('shoppingList:quickAdd.adding') : exactExisting
            ? t('shoppingList:unifiedAdd.showExisting')
            : t('shoppingList:quickAdd.button')}</span>
        </button>
      </form>
      <div id="unified-grocery-status" className="unified-grocery-status" role="status" aria-live="polite">
        {guardian?.clarification.question ?? (!confirmedId && semanticReady && semantic.result.status === 'ok' &&
          semantic.result.classification === 'distinct' && t('shoppingList:unifiedAdd.notFound'))}
      </div>
      {error && <div className="quick-add-error" role="alert">{error}</div>}
    </div>
  )
}

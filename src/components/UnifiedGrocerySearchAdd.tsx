import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { enrichItemsWithAi } from '../client/api/aiItemEnrichment'
import type { SemanticGroceryMatchResult } from '../client/api/groceries'
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
  entries,
  canEdit,
  localOnly = false,
  addContext,
  onQueryChange,
  onSemanticMatchesChange,
  onMatch
}: UnifiedGrocerySearchAddProps) {
  const { t, i18n } = useTranslation()
  const [value, setValue] = useState('')
  const [semantic, setSemantic] = useState<SemanticState>({ phase: 'idle', query: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdentity = useRef(0)
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
  const exactActive = localMatches.find(
    (entry) => !entry.bought && normalizeName(entry.item) === normalized
  )

  useEffect(() => {
    onQueryChange(isBatch ? '' : trimmed)
  }, [isBatch, onQueryChange, trimmed])

  const semanticReady = semantic.phase === 'ready' && semantic.query === trimmed
  const semanticMatchIds = semanticReady && semantic.result.status === 'ok' &&
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
    const identity = ++requestIdentity.current
    if (!trimmed || isBatch) {
      setSemantic({ phase: 'idle', query: trimmed })
      return
    }
    if (localOnly) {
      setSemantic({ phase: 'ready', query: trimmed, result: localSemanticResult(entries, trimmed) })
      return
    }
    const controller = new AbortController()
    setSemantic({ phase: 'pending', query: trimmed })
    const timeout = window.setTimeout(() => {
      onMatch(listId, trimmed, controller.signal)
        .then((result) => {
          if (identity === requestIdentity.current && !controller.signal.aborted) {
            setSemantic({ phase: 'ready', query: trimmed, result })
          }
        })
        .catch((cause) => {
          if (identity === requestIdentity.current && !controller.signal.aborted) {
            setSemantic({ phase: 'error', query: trimmed })
            if (cause instanceof Error && cause.name === 'AbortError') return
          }
        })
    }, 300)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [entries, isBatch, listId, localOnly, onMatch, trimmed])

  const prepareAndAdd = async (names: string[], assertCurrent: () => void) => {
    const items = names.map((name, index) => ({ id: `unified-add-${index}`, name }))
    let preparedItems: Array<{ id: string; correctedName: string; category: string }>
    if (localOnly) {
      preparedItems = items.map((item) => ({
        id: item.id,
        correctedName: item.name,
        category: OTHER_CATEGORY_NAME
      }))
    } else {
      preparedItems = (await enrichItemsWithAi({
          language: i18n.language === 'en' ? 'en' : 'he',
          categories: addContext.categories.length
            ? addContext.categories.map((category) => category.name)
            : [OTHER_CATEGORY_NAME],
          items
        })).items
    }
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
      if (!suggestion) throw new Error(t('shoppingList:quickAdd.aiNoResult'))
      try {
        let category = suggestion.category
        const known = categoryNames.get(normalizeName(category))
        if (known) category = known
        else if (addContext.onAddCategory) {
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
        await addContext.onAdd(suggestion.correctedName, category)
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
        if (semantic.phase !== 'ready' || semantic.query !== trimmed || semantic.result.status !== 'ok') {
          throw new Error(t('shoppingList:unifiedAdd.matchRequired'))
        }
        if (semantic.result.classification !== 'distinct') return
        await prepareAndAdd(names, assertCurrent)
      } else {
        const distinct: string[] = []
        for (let index = 0; index < names.length; index += 1) {
          assertCurrent()
          const result = localOnly
            ? localSemanticResult(entries, names[index])
            : await onMatch(listId, names[index], controller.signal)
          assertCurrent()
          if (result.status !== 'ok' || result.classification !== 'distinct') {
            setValue(names.join(', '))
            throw new Error(t('shoppingList:unifiedAdd.batchNeedsReview'))
          }
          distinct.push(names[index])
        }
        await prepareAndAdd(distinct, assertCurrent)
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

  const canCreate = canEdit && semanticReady && semantic.result.status === 'ok' &&
    semantic.result.classification === 'distinct' && !exactActive

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
          <span>{saving ? t('shoppingList:quickAdd.adding') : exactActive ||
            (semanticReady && semantic.result.status === 'ok' && semantic.result.classification !== 'distinct')
            ? t('shoppingList:unifiedAdd.showExisting')
            : t('shoppingList:quickAdd.button')}</span>
        </button>
      </form>
      <div id="unified-grocery-status" className="unified-grocery-status" role="status" aria-live="polite">
        {semantic.phase === 'pending' && t('shoppingList:unifiedAdd.checking')}
        {semantic.phase === 'error' && t('shoppingList:unifiedAdd.unavailable')}
        {semanticReady && semantic.result.status !== 'ok' && t('shoppingList:unifiedAdd.unavailable')}
        {semanticReady && semantic.result.status === 'ok' && semantic.result.classification === 'distinct' &&
          t('shoppingList:unifiedAdd.notFound')}
      </div>
      {error && <div className="quick-add-error" role="alert">{error}</div>}
    </div>
  )
}

import { forwardRef, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { enrichItemsWithAi } from '../client/api/aiItemEnrichment'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { normalizeName } from '../lib/normalizeName'
import type { Category } from '../types'
import { Checkbox } from './ui/checkbox'

const MAX_BATCH_ITEMS = 100
const MAX_ITEM_NAME_LENGTH = 100

type PendingItem = {
  id: string
  name: string
}

interface QuickAddBarProps {
  aiAvailable?: boolean
  categories?: Category[]
  onAdd: (name: string, category?: string) => Promise<unknown> | PromiseLike<unknown>
  onAddCategory?: (category: {
    name: string
    color: string
    icon?: string
    order?: number
  }) => Promise<unknown> | PromiseLike<unknown>
}

const QuickAddBar = forwardRef<HTMLInputElement, QuickAddBarProps>(({ categories = [], onAdd, onAddCategory, aiAvailable = true }, ref) => {
  const { t, i18n } = useTranslation()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiEnabled, setAiEnabled] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const items: PendingItem[] = value
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name, index) => ({ id: `quick-add-${index}`, name }))
    if (items.length === 0 || saving) return

    if (items.length > MAX_BATCH_ITEMS) {
      setError(t('shoppingList:quickAdd.tooManyItems', { max: MAX_BATCH_ITEMS }))
      return
    }
    if (items.some((item) => item.name.length > MAX_ITEM_NAME_LENGTH)) {
      setError(t('shoppingList:quickAdd.itemTooLong', { max: MAX_ITEM_NAME_LENGTH }))
      return
    }

    setSaving(true)
    setError(null)
    try {
      const categoryNames = new Map(categories.map((entry) => [normalizeName(entry.name), entry.name]))
      let nextCategoryOrder = categories.reduce((max, entry) => Math.max(max, entry.order ?? 0), 0) + 1
      let preparedItems = items.map((item) => ({ ...item, correctedName: item.name, category: undefined as string | undefined }))

      if (aiEnabled && aiAvailable) {
        const result = await enrichItemsWithAi({
          language: i18n?.language === 'en' ? 'en' : 'he',
          categories: categories.length > 0 ? categories.map((entry) => entry.name) : [OTHER_CATEGORY_NAME],
          items
        })
        const suggestions = new Map(result.items.map((item) => [item.id, item]))
        preparedItems = items.map((item) => {
          const suggestion = suggestions.get(item.id)
          if (!suggestion) throw new Error(t('shoppingList:quickAdd.aiNoResult'))
          return { ...item, correctedName: suggestion.correctedName, category: suggestion.category }
        })
      }

      for (let index = 0; index < preparedItems.length; index += 1) {
        const item = preparedItems[index]
        try {
          let category = item.category
          if (category) {
            const normalizedCategory = normalizeName(category)
            const knownCategory = categoryNames.get(normalizedCategory)
            if (knownCategory) {
              category = knownCategory
            } else if (onAddCategory) {
              await onAddCategory({ name: category, color: '#94a3b8', icon: '📌', order: nextCategoryOrder })
              categoryNames.set(normalizedCategory, category)
              nextCategoryOrder += 1
            }
          }
          if (category) {
            await onAdd(item.correctedName, category)
          } else {
            await onAdd(item.correctedName)
          }
        } catch (cause) {
          setValue(items.slice(index).map((entry) => entry.name).join(', '))
          throw cause
        }
      }
      setValue('')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(t('shoppingList:quickAdd.failed', { message }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="quick-add" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="quick-add-input">
        {t('shoppingList:quickAdd.label')}
      </label>
      <input
        ref={ref}
        id="quick-add-input"
        className="quick-add-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t('shoppingList:quickAdd.placeholder')}
        autoComplete="off"
        enterKeyHint="done"
        aria-describedby={error ? 'quick-add-error' : undefined}
      />
      <button className="quick-add-button" type="submit" disabled={!value.trim() || saving}>
        <Plus aria-hidden="true" />
        <span>{saving ? t('shoppingList:quickAdd.adding') : t('shoppingList:quickAdd.button')}</span>
      </button>
      {aiAvailable && <label className="quick-add-ai">
        <Checkbox
          checked={aiEnabled}
          disabled={saving}
          onCheckedChange={(checked) => {
            setAiEnabled(checked === true)
          }}
        />
        {t('shoppingList:quickAdd.aiAssistant')}
      </label>}
      {error && (
        <div id="quick-add-error" className="quick-add-error" role="alert">
          {error}
        </div>
      )}
    </form>
  )
})
QuickAddBar.displayName = 'QuickAddBar'

export default QuickAddBar

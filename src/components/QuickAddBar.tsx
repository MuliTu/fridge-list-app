import { forwardRef, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { enrichItemsWithAi } from '../client/api/aiItemEnrichment'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { normalizeName } from '../lib/normalizeName'
import type { Category } from '../types'
import { Checkbox } from './ui/checkbox'

interface QuickAddBarProps {
  categories?: Category[]
  onAdd: (name: string, category?: string) => Promise<unknown> | PromiseLike<unknown>
  onAddCategory?: (category: {
    name: string
    color: string
    icon?: string
    order?: number
  }) => Promise<unknown> | PromiseLike<unknown>
}

const QuickAddBar = forwardRef<HTMLInputElement, QuickAddBarProps>(({ categories = [], onAdd, onAddCategory }, ref) => {
  const { t, i18n } = useTranslation()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiEnabled, setAiEnabled] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = value.trim()
    if (!name || saving) return

    setSaving(true)
    setError(null)
    try {
      if (aiEnabled) {
        const result = await enrichItemsWithAi({
          language: i18n?.language === 'en' ? 'en' : 'he',
          categories: categories.length > 0 ? categories.map((entry) => entry.name) : [OTHER_CATEGORY_NAME],
          items: [{ id: 'quick-add-item', name }]
        })
        const suggestion = result.items[0]
        if (!suggestion) throw new Error(t('shoppingList:quickAdd.aiNoResult'))
        const existingCategory = categories.find(
          (entry) => normalizeName(entry.name) === normalizeName(suggestion.category)
        )?.name
        if (!existingCategory && onAddCategory) {
          const nextOrder = categories.reduce((max, entry) => Math.max(max, entry.order ?? 0), 0) + 1
          await onAddCategory({ name: suggestion.category, color: '#94a3b8', icon: '📌', order: nextOrder })
        }
        await onAdd(suggestion.correctedName, existingCategory ?? suggestion.category)
      } else {
        await onAdd(name)
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
      <label className="quick-add-ai">
        <Checkbox
          checked={aiEnabled}
          disabled={saving}
          onCheckedChange={(checked) => {
            setAiEnabled(checked === true)
          }}
        />
        {t('shoppingList:quickAdd.aiAssistant')}
      </label>
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

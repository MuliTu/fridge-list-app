import { forwardRef, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface QuickAddBarProps {
  onAdd: (name: string) => Promise<unknown> | PromiseLike<unknown>
}

const QuickAddBar = forwardRef<HTMLInputElement, QuickAddBarProps>(({ onAdd }, ref) => {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = value.trim()
    if (!name || saving) return

    setSaving(true)
    setError(null)
    try {
      await onAdd(name)
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

import { useTranslation } from 'react-i18next'

type ShoppingListSearchProps = {
  value: string
  onChange: (value: string) => void
}

// Real-time client-side search box for the shopping list. Purely a UI filter — it
// never touches Firebase and its state is intentionally ephemeral (lives in the route's
// local state, so navigating away and back resets it, per the ticket's FR-9).
export const ShoppingListSearch = ({ value, onChange }: ShoppingListSearchProps) => {
  const { t } = useTranslation()
  return (
    <div className="list-search">
      <span className="list-search-icon" aria-hidden="true">
        🔍
      </span>
      <input
        type="text"
        className="list-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('shoppingList:search.placeholder')}
        aria-label={t('shoppingList:search.label')}
        autoComplete="off"
      />
      {value && (
        <button
          type="button"
          className="list-search-clear"
          onClick={() => onChange('')}
          aria-label={t('shoppingList:search.clear')}
        >
          ✕
        </button>
      )}
    </div>
  )
}

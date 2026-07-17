import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'

interface SearchSuggestAddProps {
  // Trimmed (not lowercased) search text, so the button/prompt shows and the
  // add-item modal gets pre-filled with what the user actually typed.
  query: string
  onSuggestAdd: () => void
}

// Shown in place of the grouped list when a non-empty search query matches
// nothing on the current list — offers a one-tap shortcut into the existing
// add-item flow (GroceryItemModal) instead of making the user clear the search
// and hunt for the separate FAB button.
export default function SearchSuggestAdd({ query, onSuggestAdd }: SearchSuggestAddProps) {
  const { t } = useTranslation()
  return (
    <div className="all-empty flex-col gap-4">
      <p className="m-0">{t('shoppingList:search.noResults', { query })}</p>
      <Button type="button" onClick={onSuggestAdd}>
        {t('shoppingList:search.suggestAdd', { query })}
      </Button>
    </div>
  )
}

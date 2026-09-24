import { useTranslation } from 'react-i18next'

type ActiveListLabelProps = {
  activeList: string | null
}

// Glanceable "which list am I looking at" indicator, sitting right below the
// list-picker pills. The pills' `.active` highlight (ListPicker.tsx) is subtle by
// design (a faint background/border shift) and easy to miss from tablet-viewing
// distance, especially with several custom-list pills in a row — this is a
// second, unmissable signal that isn't just a color/contrast change.
// Custom list names are literal user-entered strings and are never translated. Only
// the permanent-list case and surrounding "currently viewing" copy go through i18n.
export const ActiveListLabel = ({ activeList }: ActiveListLabelProps) => {
  const { t } = useTranslation()
  const listName = activeList || t('shoppingList:listPicker.permanentList')

  return (
    <div className="active-list-label">
      <h2>
        {t('shoppingList:listPicker.activeListLabel', { listName })}
      </h2>
    </div>
  )
}

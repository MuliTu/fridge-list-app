import { useTranslation } from 'react-i18next'

interface ActiveListLabelProps {
  activeList: string | null
}

// Glanceable "which list am I looking at" indicator, sitting right below the
// list-picker pills. The pills' `.active` highlight (ListPicker.tsx) is subtle by
// design (a faint background/border shift) and easy to miss from tablet-viewing
// distance, especially with several custom-list pills in a row — this is a
// second, unmissable signal that isn't just a color/contrast change.
// Custom list names are literal user-entered strings and are never translated
// (see CLAUDE.md's i18n section) — only the permanent-list case and the
// surrounding "currently viewing" copy go through i18n.
export default function ActiveListLabel({ activeList }: ActiveListLabelProps) {
  const { t } = useTranslation()
  const listName = activeList || t('shoppingList:listPicker.permanentList')

  return (
    <div className="mt-2 mb-1 text-center">
      <h2 className="m-0 text-lg font-bold tracking-tight text-foreground sm:text-xl">
        {t('shoppingList:listPicker.activeListLabel', { listName })}
      </h2>
    </div>
  )
}

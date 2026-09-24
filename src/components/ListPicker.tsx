import { useTranslation } from 'react-i18next'

type ListPickerProps = {
  activeList: string | null
  customLists: string[]
  onSelectList: (list: string | null) => void
}

const PERMANENT_LIST = null

// Only the switcher pills live here now — creating/importing/deleting a list and
// sharing what's missing moved into the sidebar (see ListPickerActionsContext),
// since those are management actions, not the quick "which list am I looking at"
// switch someone reaches for constantly while actually shopping.
export const ListPicker = ({ activeList, customLists, onSelectList }: ListPickerProps) => {
  const { t } = useTranslation()
  return (
    <div className="list-picker">
      <button
        className={`list-pill${activeList === PERMANENT_LIST ? ' active' : ''}`}
        onClick={() => onSelectList(PERMANENT_LIST)}
      >
        {t('shoppingList:listPicker.permanentList')}
      </button>
      {customLists.map((name) => (
        <button
          key={name}
          className={`list-pill${activeList === name ? ' active' : ''}`}
          onClick={() => onSelectList(name)}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

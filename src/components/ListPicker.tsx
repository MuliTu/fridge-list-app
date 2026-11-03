import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface ListPickerProps {
  activeList: string | null
  customLists: string[]
  onSelectList: (list: string | null) => void
}

const PERMANENT_LIST = null

// Only the switcher pills live here now — creating/importing/deleting a list and
// sharing what's missing moved into the sidebar (see ListPickerActionsContext),
// since those are management actions, not the quick "which list am I looking at"
// switch someone reaches for constantly while actually shopping.
export default function ListPicker({ activeList, customLists, onSelectList }: ListPickerProps) {
  const { t } = useTranslation()
  return (
    <>
      <Select
        value={activeList === null ? 'permanent' : `list:${activeList}`}
        onValueChange={value => onSelectList(value === 'permanent' ? null : value.slice(5))}
      >
        <SelectTrigger className="list-picker-select mobile-picker-trigger" aria-label={t('shoppingList:listPicker.sectionLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="mobile-picker-content z-[60]" collisionPadding={12}>
          <SelectItem value="permanent" className="mobile-picker-option">{t('shoppingList:listPicker.permanentList')}</SelectItem>
          {customLists.map(name => <SelectItem key={name} value={`list:${name}`} className="mobile-picker-option">{name}</SelectItem>)}
        </SelectContent>
      </Select>
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
    </>
  )
}

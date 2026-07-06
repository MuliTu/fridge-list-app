import { useTranslation } from 'react-i18next'

interface ListPickerProps {
  activeList: string | null
  customLists: string[]
  canEdit: boolean
  hasUnbought: boolean
  onSelectList: (list: string | null) => void
  onCreateList: () => void
  onDeleteList: () => void
  onShareMissing: () => void
}

const PERMANENT_LIST = null

export default function ListPicker({
  activeList,
  customLists,
  canEdit,
  hasUnbought,
  onSelectList,
  onCreateList,
  onDeleteList,
  onShareMissing
}: ListPickerProps) {
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
      {canEdit && (
        <button className="list-pill list-pill-new" onClick={onCreateList}>
          {t('shoppingList:listPicker.newList')}
        </button>
      )}
      {canEdit && activeList !== PERMANENT_LIST && (
        <button className="list-delete-btn" onClick={onDeleteList}>
          {t('shoppingList:listPicker.deleteList')}
        </button>
      )}
      {hasUnbought && (
        <button className="list-pill" onClick={onShareMissing}>
          {t('shoppingList:listPicker.shareMissing')}
        </button>
      )}
    </div>
  )
}

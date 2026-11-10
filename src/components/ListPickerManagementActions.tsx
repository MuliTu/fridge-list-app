import { useTranslation } from 'react-i18next'
import type { ListPickerActions } from '../hooks/ListPickerActionsContext'

type ListPickerManagementActionsProps = {
  actions: ListPickerActions
  itemClassName: string
  sectionLabelClassName: string
  dividerClassName: string
  runAfterSidebarCloses: (action: () => void) => void
}

export function ListPickerManagementActions({
  actions,
  itemClassName,
  sectionLabelClassName,
  dividerClassName,
  runAfterSidebarCloses
}: ListPickerManagementActionsProps) {
  const { t } = useTranslation()

  return (
    <>
      <div className={dividerClassName} />
      <div className={sectionLabelClassName}>
        {t('shoppingList:listPicker.sectionLabel')}
      </div>
      {actions.canEdit && (
        <button className={itemClassName} onClick={() => runAfterSidebarCloses(actions.onCreateList)}>
          {t('shoppingList:listPicker.newList')}
        </button>
      )}
      {actions.canEdit && (
        <button className={itemClassName} onClick={() => runAfterSidebarCloses(actions.onBulkUpload)}>
          {t('shoppingList:listPicker.bulkUpload')}
        </button>
      )}
      {actions.hasUnbought && (
        <button className={itemClassName} onClick={() => runAfterSidebarCloses(actions.onShareMissing)}>
          {t('shoppingList:listPicker.shareMissing')}
        </button>
      )}
      {actions.canDeleteList && (
        <button
          className={itemClassName}
          disabled={actions.deletePending}
          onClick={() => runAfterSidebarCloses(actions.onDeleteList)}
        >
          {t(actions.deletePending
            ? 'shoppingList:listPicker.deletingList'
            : 'shoppingList:listPicker.deleteList')}
        </button>
      )}
    </>
  )
}

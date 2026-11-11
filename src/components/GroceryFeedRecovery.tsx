import { useTranslation } from 'react-i18next'
import { useGroceriesFeed } from '../hooks/GroceriesFeedContext'

export function GroceryFeedRecovery() {
  const { t } = useTranslation()
  const { hasError, status, retry } = useGroceriesFeed()

  if (!hasError) return null

  return (
    <div className="grocery-feed-recovery" role="alert">
      <span>{status}</span>
      <button type="button" onClick={retry}>
        {t('workspace.feedRetry')}
      </button>
    </div>
  )
}

import { useTranslation } from 'react-i18next'

interface ListSkeletonProps {
  variant: 'flat' | 'grid'
  sections?: number
  rows?: number
}

export default function ListSkeleton({ variant, sections = 3, rows = 3 }: ListSkeletonProps) {
  const { t } = useTranslation()

  return (
    <div className={variant === 'flat' ? 'flat-list' : 'board-grid'} aria-hidden="true">
      <span className="sr-only">{t('common:loading')}</span>
      {Array.from({ length: sections }).map((_, i) => (
        <section className="panel" key={i}>
          <div className="skeleton-block skeleton-panel-header" />
          {Array.from({ length: rows }).map((_, j) => (
            <div className="skeleton-block skeleton-row" key={j} />
          ))}
        </section>
      ))}
    </div>
  )
}

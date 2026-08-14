import { useTranslation } from 'react-i18next'
import { changeLanguage, SUPPORTED_LANGUAGES } from '../i18n/config'
import { useBoughtItemsPreference } from '../hooks/BoughtItemsPreferenceContext'
import { useStockSuggestion } from '../hooks/useStockSuggestion'

interface SettingRowProps {
  title: string
  description: string
  stateLabel: string
  pressed?: boolean
  disabled?: boolean
  onToggle: () => void
}

function SettingRow({
  title,
  description,
  stateLabel,
  pressed,
  disabled = false,
  onToggle
}: SettingRowProps) {
  return (
    <button
      type="button"
      className="flex min-h-20 w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3 text-start text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
      aria-label={`${title}: ${stateLabel}. ${description}`}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <span
        className="shrink-0 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground"
        aria-hidden="true"
      >
        {stateLabel}
      </span>
    </button>
  )
}

export default function UserSettingsPanel() {
  const { t, i18n } = useTranslation()
  const { enabled: stockSuggestionEnabled, toggle: toggleStockSuggestion } = useStockSuggestion()
  const {
    keepBoughtItemsInCategories,
    isResolved: boughtItemsPreferenceResolved,
    saveError: boughtItemsPreferenceSaveError,
    toggleBoughtItemsPlacement
  } = useBoughtItemsPreference()
  const otherLanguage = SUPPORTED_LANGUAGES.find((language) => language !== i18n.language) || 'en'

  return (
    <section className="mx-auto w-full max-w-[640px] px-3 pb-24 pt-4" aria-labelledby="user-settings-title">
      <div className="mb-4 px-1">
        <h2 id="user-settings-title" className="text-xl font-semibold text-foreground">
          {t('settings.title')}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('settings.description')}</p>
      </div>

      <div className="grid gap-3">
        <SettingRow
          title={t('settings.language.title')}
          description={t('settings.language.description')}
          stateLabel={t(`language.${i18n.language}`)}
          onToggle={() => changeLanguage(otherLanguage)}
        />
        <SettingRow
          title={t('settings.boughtItems.title')}
          description={t('settings.boughtItems.description')}
          stateLabel={t(
            keepBoughtItemsInCategories
              ? 'settings.boughtItems.inCategories'
              : 'settings.boughtItems.separateSection'
          )}
          pressed={keepBoughtItemsInCategories}
          disabled={!boughtItemsPreferenceResolved}
          onToggle={() => {
            toggleBoughtItemsPlacement().catch(() => {})
          }}
        />
        <SettingRow
          title={t('settings.stockSuggestion.title')}
          description={t('settings.stockSuggestion.description')}
          stateLabel={t(stockSuggestionEnabled ? 'settings.on' : 'settings.off')}
          pressed={stockSuggestionEnabled}
          onToggle={toggleStockSuggestion}
        />
      </div>

      {boughtItemsPreferenceSaveError && (
        <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="status">
          {t('settings.preferenceSaveFailed')}
        </p>
      )}
    </section>
  )
}

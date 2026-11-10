import { useState, type RefObject } from 'react'
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { changeLanguage, SUPPORTED_LANGUAGES } from '../i18n/config'
import type { Category } from '../types'
import { BehaviorSettingsContent } from './BehaviorSettingsModal'
import { CategoriesSettingsContent } from './CategoriesModal'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'

type SettingsPanel = 'root' | 'language' | 'behavior' | 'preferences' | 'categories'

type SettingsModalProps = {
  categories: Category[]
  canEdit: boolean
  stockSuggestionEnabled: boolean
  keepBoughtItemsInCategories: boolean
  boughtItemsPreferenceResolved: boolean
  boughtItemsPreferenceSaveError: boolean
  onToggleStockSuggestion: () => void
  onToggleBoughtItemsPlacement: () => Promise<void>
  onClose: () => void
  returnFocusRef: RefObject<HTMLButtonElement>
}

export function SettingsModal({
  categories,
  canEdit,
  stockSuggestionEnabled,
  keepBoughtItemsInCategories,
  boughtItemsPreferenceResolved,
  boughtItemsPreferenceSaveError,
  onToggleStockSuggestion,
  onToggleBoughtItemsPlacement,
  onClose,
  returnFocusRef
}: SettingsModalProps) {
  const { t, i18n } = useTranslation()
  const [panel, setPanel] = useState<SettingsPanel>('root')
  const isRtl = i18n.dir() === 'rtl'
  const BackIcon = isRtl ? ArrowRight : ArrowLeft
  const NextIcon = isRtl ? ChevronLeft : ChevronRight

  const panelTitle = panel === 'language'
    ? t('settings.languageTitle')
    : panel === 'behavior'
      ? t('settings.behaviorTitle')
      : panel === 'preferences'
        ? t('settings.preferencesTitle')
        : panel === 'categories'
          ? t('categories:title')
          : t('settings.title')

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="settings-dialog"
        closeLabel={t('actions.close')}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusRef.current?.focus()
        }}
      >
        <DialogHeader className="settings-header">
          {panel !== 'root' && (
            <Button
              variant="ghost"
              size="icon"
              className="settings-back"
              onClick={() => setPanel('root')}
              aria-label={t('settings.back')}
            >
              <BackIcon aria-hidden="true" />
            </Button>
          )}
          <div>
            <DialogTitle>{panelTitle}</DialogTitle>
            <DialogDescription>
              {panel === 'root' ? t('settings.description') : t('settings.panelDescription')}
            </DialogDescription>
          </div>
        </DialogHeader>

        {panel === 'root' && (
          <nav className="settings-sections" aria-label={t('settings.sectionsLabel')}>
            <SettingsSectionButton label={t('settings.languageTitle')} detail={t(`language.${i18n.language === 'en' ? 'en' : 'he'}`)} onClick={() => setPanel('language')} icon={NextIcon} />
            <SettingsSectionButton label={t('settings.behaviorTitle')} detail={t('settings.behaviorSummary')} onClick={() => setPanel('behavior')} icon={NextIcon} />
            {canEdit && (
              <>
                <SettingsSectionButton label={t('settings.preferencesTitle')} detail={t('settings.preferencesSummary')} onClick={() => setPanel('preferences')} icon={NextIcon} />
                <SettingsSectionButton label={t('categories:title')} detail={t('settings.categoriesSummary')} onClick={() => setPanel('categories')} icon={NextIcon} />
              </>
            )}
          </nav>
        )}

        {panel === 'language' && (
          <fieldset className="settings-choice-group">
            <legend>{t('settings.chooseLanguage')}</legend>
            {SUPPORTED_LANGUAGES.map((language) => (
              <label key={language}>
                <input
                  type="radio"
                  name="settings-language"
                  value={language}
                  checked={i18n.language === language}
                  onChange={() => changeLanguage(language)}
                />
                <span>{t(`language.${language}`)}</span>
              </label>
            ))}
          </fieldset>
        )}

        {panel === 'behavior' && <div className="behavior-settings"><BehaviorSettingsContent /></div>}

        {panel === 'preferences' && (
          <div className="settings-preferences">
            <label className="behavior-control">
              <span>{t('settings.stockSuggestion')}<small>{t('settings.stockSuggestionHint')}</small></span>
              <input type="checkbox" checked={stockSuggestionEnabled} onChange={onToggleStockSuggestion} />
            </label>
            <label className={`behavior-control${boughtItemsPreferenceResolved ? '' : ' is-disabled'}`}>
              <span>{t('settings.boughtItemsPlacement')}<small>{t('settings.boughtItemsPlacementHint')}</small></span>
              <input
                type="checkbox"
                checked={keepBoughtItemsInCategories}
                disabled={!boughtItemsPreferenceResolved}
                onChange={() => onToggleBoughtItemsPlacement().catch(() => {})}
              />
            </label>
            {boughtItemsPreferenceSaveError && <p role="alert" className="text-sm text-destructive">{t('menu.preferenceSaveFailed')}</p>}
          </div>
        )}

        {panel === 'categories' && <CategoriesSettingsContent categories={categories} />}
      </DialogContent>
    </Dialog>
  )
}

type SettingsSectionButtonProps = {
  label: string
  detail: string
  onClick: () => void
  icon: typeof ChevronRight
}

function SettingsSectionButton({ label, detail, onClick, icon: NextIcon }: SettingsSectionButtonProps) {
  return (
    <button type="button" className="settings-section-button" onClick={onClick}>
      <span><strong>{label}</strong><small>{detail}</small></span>
      <NextIcon aria-hidden="true" />
    </button>
  )
}

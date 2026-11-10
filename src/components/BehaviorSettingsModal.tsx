import { useTranslation } from 'react-i18next'
import { useBehaviorSettings } from '../hooks/BehaviorSettingsContext'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'

export function BehaviorSettingsContent() {
  const { t } = useTranslation()
  const { settings, update, saveError } = useBehaviorSettings()
  const holding = settings.purchaseGesture === 'hold'

  return (
    <>
      <fieldset>
        <legend>{t('shoppingList:behavior.section')}</legend>
        <fieldset className="behavior-choice">
          <legend>{t('shoppingList:behavior.gesture')}</legend>
          <div className="behavior-options">
            {(['tap', 'hold'] as const).map(value => (
              <label key={value}>
                <input type="radio" name="purchase-gesture" value={value} checked={settings.purchaseGesture === value} onChange={() => update({ purchaseGesture: value })} />
                <span>{t(`shoppingList:behavior.${value}`)}</span>
              </label>
            ))}
          </div>
          {holding && <p className="behavior-hint">{t('shoppingList:behavior.holdImmediate')}</p>}
        </fieldset>
        <label className={`behavior-control${holding ? ' is-disabled' : ''}`}>
          <span>{t('shoppingList:behavior.countdown')}<small>{t(holding ? 'shoppingList:behavior.countdownDisabled' : 'shoppingList:behavior.countdownHint')}</small></span>
          <input type="checkbox" checked={!holding && settings.showCountdown} disabled={holding} onChange={e => update({ showCountdown: e.target.checked })} />
        </label>
        <fieldset className="behavior-choice">
          <legend>{t('shoppingList:behavior.presentation')}</legend>
          <div className="behavior-options">
            {(['categories', 'flat'] as const).map(value => (
              <label key={value}>
                <input type="radio" name="list-presentation" value={value} checked={settings.listPresentation === value} onChange={() => update({ listPresentation: value })} />
                <span>{t(`shoppingList:behavior.${value}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="behavior-control"><span>{t('shoppingList:behavior.urgent')}</span><input type="checkbox" checked={settings.showUrgent} onChange={e => update({ showUrgent: e.target.checked })} /></label>
        <label className="behavior-control"><span>{t('shoppingList:behavior.chef')}</span><input type="checkbox" checked={settings.showChef} onChange={e => update({ showChef: e.target.checked })} /></label>
      </fieldset>
      {saveError && <p role="alert">{t('shoppingList:behavior.saveFailed')}</p>}
    </>
  )
}

export default function BehaviorSettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="behavior-settings" closeLabel={t('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('shoppingList:behavior.title')}</DialogTitle>
          <DialogDescription>{t('shoppingList:behavior.description')}</DialogDescription>
        </DialogHeader>
        <BehaviorSettingsContent />
      </DialogContent>
    </Dialog>
  )
}

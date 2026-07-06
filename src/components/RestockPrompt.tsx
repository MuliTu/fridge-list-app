import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StockItem } from '../types'

interface RestockPromptProps {
  item: StockItem
  onConfirm: (amount: number) => void
  onDismiss: () => void
}

export default function RestockPrompt({ item, onConfirm, onDismiss }: RestockPromptProps) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState<string | number>(1)

  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{t('common:restockPrompt.title')}</h2>
        <p className="modal-note-readonly">
          {t('common:restockPrompt.message', { itemName: item.name })}
        </p>
        <label className="modal-input-label">
          {t('common:restockPrompt.quantityLabel', { unit: item.unit })}
          <input
            className="modal-input"
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onDismiss}>
            {t('common:restockPrompt.skip')}
          </button>
          <button className="modal-btn primary" onClick={() => onConfirm(Math.max(0, Number(amount) || 0))}>
            {t('common:restockPrompt.addToStock')}
          </button>
        </div>
      </div>
    </div>
  )
}

import { ChefHat, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { GroceryItem, RecipeMealType } from '../types'

interface PersonalChefChatProps {
  open: boolean
  servings: number
  mealType: RecipeMealType
  preferences: string
  availableProducts: GroceryItem[]
  selectedKeys: Set<string>
  selectionMode: boolean
  isGenerating: boolean
  error: string | null
  onOpen: () => void
  onClose: () => void
  onServingsChange: (servings: number) => void
  onMealTypeChange: (mealType: RecipeMealType) => void
  onPreferencesChange: (preferences: string) => void
  onStartSelection: () => void
  onCancelSelection: () => void
  onToggleProduct: (key: string) => void
  onSelectAll: () => void
  onGenerate: () => void
}

const mealTypes: RecipeMealType[] = [
  'quick_dinner',
  'full_dinner',
  'breakfast',
  'lunch',
  'snack',
  'meal_prep'
]

type ChefChatStep = 'products' | 'servings' | 'mealType' | 'preferences' | 'ready'

export default function PersonalChefChat({
  open,
  servings,
  mealType,
  preferences,
  availableProducts,
  selectedKeys,
  selectionMode,
  isGenerating,
  error,
  onOpen,
  onClose,
  onServingsChange,
  onMealTypeChange,
  onPreferencesChange,
  onStartSelection,
  onCancelSelection,
  onToggleProduct,
  onSelectAll,
  onGenerate
}: PersonalChefChatProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<ChefChatStep>('products')
  const allSelected = availableProducts.length > 0 && selectedKeys.size === availableProducts.length
  const selectedProducts = availableProducts.filter((product) => selectedKeys.has(product.key))

  useEffect(() => {
    if (open) setStep('products')
  }, [open])

  const handleProductStep = () => {
    if (!selectionMode) {
      onStartSelection()
      return
    }
    if (selectedKeys.size > 0) {
      setStep('servings')
    }
  }

  const handleClose = () => {
    setStep('products')
    onClose()
  }

  const handleGenerate = () => {
    setStep('ready')
    onGenerate()
  }

  return (
    <>
      <button className="fab-chef-btn" onClick={onOpen} aria-label={t('shoppingList:chef.open')}>
        <ChefHat aria-hidden="true" />
      </button>
      {open && (
        <section className="chef-chat" aria-label={t('shoppingList:chef.title')}>
          <div className="chef-chat-header">
            <div className="chef-avatar" aria-hidden="true">
              <ChefHat />
            </div>
            <div>
              <h2>{t('shoppingList:chef.title')}</h2>
              <p>{t('shoppingList:chef.greeting')}</p>
            </div>
            <button className="chef-close-btn" onClick={handleClose} aria-label={t('actions.close')}>
              <X aria-hidden="true" />
            </button>
          </div>

          <div className="chef-thread" aria-live="polite">
            <div className="chef-message chef-message-ai">
              {t('shoppingList:chef.chat.productsQuestion')}
            </div>
            {selectedProducts.length > 0 && (
              <div className="chef-message chef-message-user">
                {t('shoppingList:chef.chat.productsAnswer', {
                  products: selectedProducts.map((product) => product.item).join(', ')
                })}
              </div>
            )}

            {step !== 'products' && (
              <>
                <div className="chef-message chef-message-ai">
                  {t('shoppingList:chef.chat.servingsQuestion')}
                </div>
                <div className="chef-message chef-message-user">
                  {t('shoppingList:chef.servingsValue', { count: servings })}
                </div>
              </>
            )}

            {(step === 'mealType' || step === 'preferences' || step === 'ready') && (
              <>
                <div className="chef-message chef-message-ai">
                  {t('shoppingList:chef.chat.mealTypeQuestion')}
                </div>
                <div className="chef-message chef-message-user">
                  {t(`shoppingList:chef.mealTypes.${mealType}`)}
                </div>
              </>
            )}

            {(step === 'preferences' || step === 'ready') && (
              <>
                <div className="chef-message chef-message-ai">
                  {t('shoppingList:chef.chat.preferencesQuestion')}
                </div>
                <div className="chef-message chef-message-user">
                  {preferences.trim() || t('shoppingList:chef.chat.noPreferences')}
                </div>
              </>
            )}
          </div>

          {step === 'products' && (
            <div className="chef-field">
              <div className="chef-product-row">
                <span>{t('shoppingList:chef.productsTitle')}</span>
                {selectionMode && (
                  <button onClick={onCancelSelection}>{t('actions.cancel')}</button>
                )}
              </div>
              {selectionMode && (
                <>
                  {availableProducts.length === 0 ? (
                    <p className="chef-muted">{t('shoppingList:chef.noProducts')}</p>
                  ) : (
                    <>
                      <button className="chef-select-all" onClick={onSelectAll}>
                        {allSelected ? t('shoppingList:chef.clearAll') : t('shoppingList:chef.selectAll')}
                      </button>
                      <div className="chef-product-list">
                        {availableProducts.map((product) => (
                          <label key={product.key} className="chef-product-option">
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(product.key)}
                              onChange={() => onToggleProduct(product.key)}
                            />
                            <span>{product.item}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
              <button
                className="chef-primary"
                disabled={selectionMode && selectedKeys.size === 0}
                onClick={handleProductStep}
              >
                {selectionMode
                  ? t('shoppingList:chef.chat.productsDone', { count: selectedKeys.size })
                  : t('shoppingList:chef.chat.startProducts')}
              </button>
            </div>
          )}

          {step === 'servings' && (
            <div className="chef-field">
              <label htmlFor="chef-servings">{t('shoppingList:chef.servings')}</label>
              <input
                id="chef-servings"
                type="number"
                min={1}
                max={20}
                value={servings}
                onChange={(event) => onServingsChange(Number(event.target.value) || 1)}
              />
              <button className="chef-primary" onClick={() => setStep('mealType')}>
                {t('shoppingList:chef.chat.continue')}
              </button>
            </div>
          )}

          {step === 'mealType' && (
            <div className="chef-field">
              <span>{t('shoppingList:chef.mealType')}</span>
              <div className="chef-choice-grid">
                {mealTypes.map((type) => (
                  <button
                    key={type}
                    className={type === mealType ? 'active' : ''}
                    onClick={() => onMealTypeChange(type)}
                    aria-pressed={type === mealType}
                  >
                    {t(`shoppingList:chef.mealTypes.${type}`)}
                  </button>
                ))}
              </div>
              <button className="chef-primary" onClick={() => setStep('preferences')}>
                {t('shoppingList:chef.chat.continue')}
              </button>
            </div>
          )}

          {step === 'preferences' && (
            <div className="chef-field">
              <label htmlFor="chef-preferences">{t('shoppingList:chef.preferences')}</label>
              <textarea
                id="chef-preferences"
                value={preferences}
                onChange={(event) => onPreferencesChange(event.target.value)}
                placeholder={t('shoppingList:chef.preferencesPlaceholder')}
              />
              {error && <div className="chef-error">{error}</div>}
              <button
                className="chef-primary"
                disabled={isGenerating || selectedKeys.size === 0}
                onClick={handleGenerate}
              >
                {isGenerating
                  ? t('shoppingList:chef.generating')
                  : t('shoppingList:chef.generate', { count: selectedKeys.size })}
              </button>
            </div>
          )}

          {step === 'ready' && (
            <>
              <div className="chef-message chef-message-ai">
                {isGenerating
                  ? t('shoppingList:chef.chat.generating')
                  : t('shoppingList:chef.chat.ready')}
              </div>
              {error && <div className="chef-error">{error}</div>}
              {!isGenerating && (
                <button className="chef-primary" onClick={() => setStep('preferences')}>
                  {t('shoppingList:chef.chat.editAnswers')}
                </button>
              )}
            </>
          )}
        </section>
      )}
    </>
  )
}

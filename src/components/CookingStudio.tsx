import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, CookingPot, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGroceriesFeed } from '../hooks/GroceriesFeedContext'
import { useCookingSession } from '../hooks/useCookingSession'
import { isChefFoodProduct } from '../lib/chefProducts'
import type { RecipeMealType } from '../types'
import RecipeSuggestionModal from './RecipeSuggestionModal'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'

const mealTypes: RecipeMealType[] = [
  'quick_dinner',
  'full_dinner',
  'breakfast',
  'lunch',
  'snack',
  'meal_prep'
]

export function CookingStudio() {
  const { t } = useTranslation()
  const { entries, isLoading } = useGroceriesFeed()
  const products = entries.filter((entry) => entry.bought && isChefFoodProduct(entry))
  const session = useCookingSession(products)
  const [open, setOpen] = useState(false)
  const launchRef = useRef<HTMLButtonElement>(null)
  const composerOpen = useRef(false)
  composerOpen.current = open && !session.reviewOpen

  return (
    <>
      <section className="cooking-hero">
        <div>
          <span className="workspace-kicker">
            <Sparkles size={14} aria-hidden="true" />
            {t('workspace.fromYourKitchen')}
          </span>
          <h3>{t('workspace.cookWhatYouHave')}</h3>
          <p>{t('workspace.cookingDescription')}</p>
          <Button ref={launchRef} size="lg" onClick={() => setOpen(true)} disabled={isLoading}>
            {t('workspace.planMeal')}
            <ArrowUpRight aria-hidden="true" />
          </Button>
        </div>
        <div className="cooking-hero-art" aria-hidden="true">
          <CookingPot strokeWidth={0.8} />
          <span>{isLoading ? '—' : products.length}</span>
          <small>{t('workspace.ingredientsReady')}</small>
        </div>
      </section>
      {session.error && !open && (
        <p className="chef-error" role="alert">
          {session.error}
        </p>
      )}
      <Dialog
        open={open && !session.reviewOpen}
        onOpenChange={(next) => {
          if (!session.generating) setOpen(next)
        }}
      >
        <DialogContent
          className="cooking-studio"
          closeLabel={t('actions.close')}
          hideClose={session.generating}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (!session.reviewOpen) launchRef.current?.focus()
          }}
        >
          <DialogTitle>{t('workspace.planMeal')}</DialogTitle>
          <DialogDescription>{t('workspace.boughtOnly')}</DialogDescription>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              session.generate()
            }}
          >
            <fieldset disabled={session.generating} className="cooking-form-grid">
              <section className="cooking-ingredients">
                <div className="studio-section-heading">
                  <h3>
                    <span>01</span>
                    {t('shoppingList:chef.productsTitle')}
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      session.setSelectedKeys(
                        session.selectedProducts.length === products.length
                          ? new Set()
                          : new Set(products.map((p) => p.key))
                      )
                    }
                    disabled={!products.length}
                  >
                    {t(
                      session.selectedProducts.length === products.length && products.length > 0
                        ? 'shoppingList:chef.clearAll'
                        : 'shoppingList:chef.selectAll'
                    )}
                  </button>
                </div>
                {!products.length ? (
                  <div className="studio-empty">
                    <CookingPot aria-hidden="true" />
                    <p>{t('shoppingList:chef.noFoodProducts')}</p>
                    <Link to="/" onClick={() => setOpen(false)}>
                      {t('workspace.backToShop')}
                    </Link>
                  </div>
                ) : (
                  <div className="studio-product-list">
                    {products.map((product) => (
                      <label className="studio-product" key={product.key}>
                        <Checkbox
                          checked={session.selectedKeys.has(product.key)}
                          onCheckedChange={() => session.toggleProduct(product.key)}
                        />
                        <span>{product.item}</span>
                        {product.quantity != null && (
                          <small>
                            {product.quantity} {product.unit}
                          </small>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </section>
              <section className="cooking-preferences">
                <div className="studio-section-heading">
                  <h3>
                    <span>02</span>
                    {t('workspace.makeItYours')}
                  </h3>
                </div>
                <label htmlFor="cook-servings">{t('shoppingList:chef.servings')}</label>
                <Input
                  id="cook-servings"
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  required
                  value={session.servings}
                  onChange={(event) => session.setServings(Number(event.target.value))}
                />
                <span className="studio-field-label">{t('shoppingList:chef.mealType')}</span>
                <div className="chef-choice-grid">
                  {mealTypes.map((type) => (
                    <button
                      type="button"
                      key={type}
                      aria-pressed={type === session.mealType}
                      className={type === session.mealType ? 'active' : ''}
                      onClick={() => session.setMealType(type)}
                    >
                      {t(`shoppingList:chef.mealTypes.${type}`)}
                    </button>
                  ))}
                </div>
                <label htmlFor="cook-preferences">{t('shoppingList:chef.preferences')}</label>
                <Textarea
                  id="cook-preferences"
                  value={session.preferences}
                  onChange={(event) => session.setPreferences(event.target.value)}
                  placeholder={t('shoppingList:chef.preferencesPlaceholder')}
                />
                <details className="studio-extra">
                  <summary>{t('shoppingList:chef.chefMessage')}</summary>
                  <Textarea
                    aria-label={t('shoppingList:chef.chefMessage')}
                    value={session.chefMessage}
                    onChange={(event) => session.setChefMessage(event.target.value)}
                    placeholder={t('shoppingList:chef.chefMessagePlaceholder')}
                  />
                </details>
              </section>
            </fieldset>
            {session.error && (
              <p className="chef-error" role="alert">
                {session.error}
              </p>
            )}
            <div className="studio-footer">
              <span>{t('workspace.reviewBeforeSave')}</span>
              <Button
                type="submit"
                disabled={session.generating || !session.selectedProducts.length}
              >
                {session.generating
                  ? t('shoppingList:chef.generating')
                  : t('shoppingList:chef.generate', { count: session.selectedProducts.length })}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <RecipeSuggestionModal
        open={session.reviewOpen}
        recipes={session.recipes}
        saving={session.saving}
        error={session.saveError}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (!composerOpen.current) launchRef.current?.focus()
        }}
        onOpenChange={(next) => {
          if (!session.saving) session.setReviewOpen(next)
        }}
        onSave={async (recipe) => {
          if (await session.save(recipe)) setOpen(false)
        }}
      />
    </>
  )
}

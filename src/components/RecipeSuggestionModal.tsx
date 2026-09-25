import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { RecipeCandidate } from '../types'
import { recipeDisplayImageUrl } from '../lib/recipeImages'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'

interface RecipeSuggestionModalProps {
  recipes: RecipeCandidate[]
  open: boolean
  saving: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onSave: (recipe: RecipeCandidate) => void
}

export default function RecipeSuggestionModal({
  recipes,
  open,
  saving,
  error,
  onOpenChange,
  onSave
}: RecipeSuggestionModalProps) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const [imageFailed, setImageFailed] = useState(false)
  const recipe = recipes[index]

  useEffect(() => {
    if (index >= recipes.length) setIndex(0)
  }, [index, recipes.length])

  useEffect(() => {
    setImageFailed(false)
  }, [recipe?.id])

  if (!recipe) return null

  const move = (direction: -1 | 1) => {
    setIndex((current) => (current + direction + recipes.length) % recipes.length)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="recipe-suggestion-modal">
        <DialogHeader>
          <DialogTitle>{t('shoppingList:chef.suggestionsTitle')}</DialogTitle>
        </DialogHeader>

        <div className="recipe-slide">
          <div className="recipe-image-frame">
            {imageFailed ? (
              <div className="recipe-image-fallback">{recipe.image.alt}</div>
            ) : (
              <img
                src={recipeDisplayImageUrl(recipe)}
                alt={recipe.image.alt}
                onError={() => setImageFailed(true)}
              />
            )}
          </div>

          <div className="recipe-slide-header">
            <button
              className="recipe-nav-btn"
              onClick={() => move(-1)}
              disabled={recipes.length <= 1}
              aria-label={t('shoppingList:chef.previousRecipe')}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <div>
              <h3>{recipe.title}</h3>
              <p>{recipe.description}</p>
            </div>
            <button
              className="recipe-nav-btn"
              onClick={() => move(1)}
              disabled={recipes.length <= 1}
              aria-label={t('shoppingList:chef.nextRecipe')}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>

          <div className="recipe-meta-grid">
            <span>{t('shoppingList:chef.servingsValue', { count: recipe.servings })}</span>
            <span>{recipe.estimatedTimeMinutes ? t('shoppingList:chef.minutes', { count: recipe.estimatedTimeMinutes }) : t('shoppingList:chef.timeUnknown')}</span>
            <span>{t(`shoppingList:chef.mealTypes.${recipe.mealType}`)}</span>
          </div>

          <div className="recipe-detail-grid">
            <section>
              <h4>{t('shoppingList:chef.ingredients')}</h4>
              <ul>
                {recipe.ingredients.map((ingredient, ingredientIndex) => (
                  <li key={`${ingredient.name}-${ingredientIndex}`}>
                    {ingredient.quantity ? `${ingredient.quantity} ` : ''}
                    {ingredient.name}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h4>{t('shoppingList:chef.steps')}</h4>
              <ol>
                {recipe.steps.map((step, stepIndex) => (
                  <li key={`${stepIndex}-${step}`}>{step}</li>
                ))}
              </ol>
            </section>
          </div>

          {recipe.assumedBasics.length > 0 && (
            <p className="recipe-basics">
              {t('shoppingList:chef.assumedBasics')}: {recipe.assumedBasics.join(', ')}
            </p>
          )}
          {recipe.chefNotes && <p className="recipe-notes">{recipe.chefNotes}</p>}
          {error && <div className="chef-error">{error}</div>}
        </div>

        <DialogFooter>
          <button className="modal-cancel" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </button>
          <button className="modal-save" disabled={saving} onClick={() => onSave(recipe)}>
            {saving ? t('actions.saving') : t('shoppingList:chef.saveRecipe')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

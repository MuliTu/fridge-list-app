import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { onValue } from '../lib/firebase'
import { recipeDisplayImageUrl } from '../lib/recipeImages'
import { useActiveList, useListApi } from '../hooks/ListContext'
import type { RecipeRecord } from '../types'
import ListSkeleton from '../components/ListSkeleton'
import { RecipeNutritionSummary } from '../components/RecipeNutritionSummary'
import { CookingStudio } from '../components/CookingStudio'
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog'
import { Button } from '../components/ui/button'
import { Clock3, ArrowUpRight, BookOpen, Search } from 'lucide-react'

function RecipeImage({ recipe }: { recipe: RecipeRecord }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="saved-recipe-image">
      {failed ? (
        <span>{recipe.image.alt}</span>
      ) : (
        <img
          src={recipeDisplayImageUrl(recipe)}
          alt={recipe.image.alt}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}

export const Route = createFileRoute('/recipes')({
  component: RecipesPage
})

function RecipesPage() {
  const { t } = useTranslation()
  const listApi = useListApi()
  const { activeList, canEdit } = useActiveList()
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeRecord | null>(null)
  const selectedRecipeTrigger = useRef<HTMLButtonElement | null>(null)
  const [query, setQuery] = useState('')
  const [recipes, setRecipes] = useState<RecipeRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [readError, setReadError] = useState(false)
  const [readAttempt, setReadAttempt] = useState(0)

  useEffect(() => {
    setSelectedRecipe(null)
    setQuery('')
  }, [listApi])

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    setIsLoading(true)
    setReadError(false)
    setRecipes([])
    const fail = () => {
      if (cancelled) return
      window.clearTimeout(timeout)
      setRecipes([])
      setReadError(true)
      setIsLoading(false)
    }
    const timeout = window.setTimeout(() => {
      fail()
      unsubscribe?.()
    }, 10_000)
    unsubscribe = onValue(
      listApi.recipesRef,
      (snapshot) => {
        if (cancelled) return
        window.clearTimeout(timeout)
        const data = snapshot.val() || {}
        const nextRecipes = Object.entries(data as Record<string, Omit<RecipeRecord, 'key'>>)
          .map(([key, recipe]) => ({ key, ...recipe }))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        setRecipes(nextRecipes)
        setReadError(false)
        setIsLoading(false)
      },
      fail
    )
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      unsubscribe?.()
    }
  }, [listApi, readAttempt])

  const filteredRecipes = recipes.filter((recipe) =>
    recipe.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  )

  return (
    <div className="cook-workspace">
      {canEdit && <CookingStudio key={activeList?.id} />}
      <div className="collection-heading">
        <div>
          <span className="workspace-kicker">{t('workspace.yourCollection')}</span>
          <h3>
            {t('workspace.savedRecipes')} <small>{isLoading || readError ? '—' : recipes.length}</small>
          </h3>
        </div>
        <label className="collection-search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label={t('workspace.searchRecipes')}
            placeholder={t('workspace.searchRecipes')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {isLoading ? (
        <ListSkeleton variant="grid" sections={2} rows={2} />
      ) : readError ? (
        <div role="alert" className="chef-error">
          <p>{t('recipes:loadFailed')}</p>
          <Button variant="secondary" onClick={() => setReadAttempt((attempt) => attempt + 1)}>
            {t('recipes:retry')}
          </Button>
        </div>
      ) : filteredRecipes.length === 0 ? (
        <div className="workspace-empty">
          <BookOpen aria-hidden="true" />
          <h3>{t(query ? 'workspace.noMatches' : 'recipes:empty')}</h3>
          <p>{t(query ? 'workspace.trySearch' : 'workspace.savedRecipesHint')}</p>
        </div>
      ) : (
        <div className="recipe-collection">
          {filteredRecipes.map((recipe) => (
            <button
              key={recipe.key}
              className="recipe-preview"
              onClick={(event) => {
                selectedRecipeTrigger.current = event.currentTarget
                setSelectedRecipe(recipe)
              }}
            >
              <RecipeImage recipe={recipe} />
              <div className="recipe-preview-copy">
                <span className="workspace-kicker">
                  {t(`recipes:mealTypes.${recipe.mealType}`)}
                </span>
                <h3>{recipe.title}</h3>
                <p>{recipe.description}</p>
                <div>
                  <span>
                    <Clock3 size={15} aria-hidden="true" />
                    {recipe.estimatedTimeMinutes
                      ? t('recipes:minutes', { count: recipe.estimatedTimeMinutes })
                      : t('recipes:timeUnknown')}
                  </span>
                  <ArrowUpRight size={19} aria-hidden="true" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <Dialog
        open={!!selectedRecipe}
        onOpenChange={(open) => {
          if (!open) setSelectedRecipe(null)
        }}
      >
        <DialogContent
          className="saved-recipe-detail"
          closeLabel={t('actions.close')}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            selectedRecipeTrigger.current?.focus()
          }}
        >
          {selectedRecipe && (
            <>
              <DialogTitle>{selectedRecipe.title}</DialogTitle>
              <p className="recipe-detail-description">{selectedRecipe.description}</p>
              <div className="recipe-meta-grid">
                <span>{t('recipes:servings', { count: selectedRecipe.servings })}</span>
                <span>
                  {selectedRecipe.estimatedTimeMinutes
                    ? t('recipes:minutes', { count: selectedRecipe.estimatedTimeMinutes })
                    : t('recipes:timeUnknown')}
                </span>
                <span>{t(`recipes:mealTypes.${selectedRecipe.mealType}`)}</span>
              </div>
              <div className="recipe-detail-grid">
                <section>
                  <h3>{t('recipes:ingredients')}</h3>
                  <ul>
                    {selectedRecipe.ingredients.map((ingredient, index) => (
                      <li key={index}>
                        {ingredient.quantity ? `${ingredient.quantity} ` : ''}
                        {ingredient.name}
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3>{t('recipes:steps')}</h3>
                  <ol>
                    {selectedRecipe.steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </section>
              </div>
              {selectedRecipe.assumedBasics?.length > 0 && (
                <p className="recipe-basics">
                  {t('shoppingList:chef.assumedBasics')}: {selectedRecipe.assumedBasics.join(', ')}
                </p>
              )}
              {selectedRecipe.chefNotes && (
                <p className="recipe-notes">{selectedRecipe.chefNotes}</p>
              )}
              <RecipeNutritionSummary nutrition={selectedRecipe.nutrition} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

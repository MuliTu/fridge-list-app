import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { onValue } from '../lib/firebase'
import { recipeDisplayImageUrl } from '../lib/recipeImages'
import { useListApi } from '../hooks/ListContext'
import type { RecipeRecord } from '../types'
import ListSkeleton from '../components/ListSkeleton'
import { RecipeNutritionSummary } from '../components/RecipeNutritionSummary'

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
  const [recipes, setRecipes] = useState<RecipeRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    const unsubscribe = onValue(
      listApi.recipesRef,
      (snapshot) => {
        const data = snapshot.val() || {}
        const nextRecipes = Object.entries(data as Record<string, Omit<RecipeRecord, 'key'>>)
          .map(([key, recipe]) => ({ key, ...recipe }))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        setRecipes(nextRecipes)
        setIsLoading(false)
      },
      (cause) => {
        setError(cause.message)
        setIsLoading(false)
      }
    )
    return unsubscribe
  }, [listApi])

  if (isLoading) return <ListSkeleton variant="flat" sections={2} rows={2} />

  if (error) {
    return <div className="all-empty">{t('recipes:loadFailed', { message: error })}</div>
  }

  if (recipes.length === 0) {
    return <div className="all-empty">{t('recipes:empty')}</div>
  }

  return (
    <div className="flat-list recipes-list">
      {recipes.map((recipe) => (
        <article key={recipe.key} className="saved-recipe-card">
          <RecipeImage recipe={recipe} />
          <div className="saved-recipe-body">
            <h2>{recipe.title}</h2>
            <p>{recipe.description}</p>
            <div className="recipe-meta-grid">
              <span>{t('recipes:servings', { count: recipe.servings })}</span>
              <span>
                {recipe.estimatedTimeMinutes
                  ? t('recipes:minutes', { count: recipe.estimatedTimeMinutes })
                  : t('recipes:timeUnknown')}
              </span>
              <span>{t(`recipes:mealTypes.${recipe.mealType}`)}</span>
            </div>
            <RecipeNutritionSummary nutrition={recipe.nutrition} />
            <section>
              <h3>{t('recipes:ingredients')}</h3>
              <ul>
                {recipe.ingredients.map((ingredient, index) => (
                  <li key={`${ingredient.name}-${index}`}>
                    {ingredient.quantity ? `${ingredient.quantity} ` : ''}
                    {ingredient.name}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3>{t('recipes:steps')}</h3>
              <ol>
                {recipe.steps.map((step, index) => (
                  <li key={`${index}-${step}`}>{step}</li>
                ))}
              </ol>
            </section>
          </div>
        </article>
      ))}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useListApi } from './ListContext'
import type { GroceryItem, RecipeCandidate, RecipeMealType } from '../types'

export function useCookingSession(products: GroceryItem[]) {
  const { t, i18n } = useTranslation()
  const listApi = useListApi()
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [servings, setServings] = useState(2)
  const [mealType, setMealType] = useState<RecipeMealType>('quick_dinner')
  const [preferences, setPreferences] = useState('')
  const [chefMessage, setChefMessage] = useState('')
  const [recipes, setRecipes] = useState<RecipeCandidate[]>([])
  const [reviewOpen, setReviewOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const busy = useRef(false)
  const selectedProducts = products.filter((product) => selectedKeys.has(product.key))

  useEffect(() => {
    let cancelled = false
    listApi
      .getPendingRecipeSaves()
      .then((pending) => {
        if (cancelled || !pending.length) return
        setRecipes(pending)
        setReviewOpen(true)
        setSaveError(t('shoppingList:chef.pendingSave'))
      })
      .catch(() => {
        if (!cancelled) setError(t('shoppingList:chef.restoreFailed'))
      })
    return () => {
      cancelled = true
    }
  }, [listApi, t])

  const toggleProduct = (key: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const generate = async () => {
    if (busy.current) return
    if (!selectedProducts.length) {
      setError(t('shoppingList:chef.selectAtLeastOne'))
      return
    }
    if (!Number.isInteger(servings) || servings < 1 || servings > 20) return
    busy.current = true
    setGenerating(true)
    setError(null)
    setSaveError(null)
    try {
      const result = await listApi.suggestRecipes({
        servings,
        mealType,
        preferences,
        chefMessage,
        products: selectedProducts.map((entry) => ({
          groceryKey: entry.key,
          name: entry.item,
          category: entry.category,
          quantity: entry.quantity ?? null,
          unit: entry.unit ?? null
        })),
        language: i18n.language === 'he' ? 'he' : 'en'
      })
      setRecipes(result.recipes)
      setReviewOpen(true)
    } catch (cause: any) {
      setError(cause?.message || t('shoppingList:chef.generateFailed'))
    } finally {
      busy.current = false
      setGenerating(false)
    }
  }

  const save = async (recipe: RecipeCandidate) => {
    if (busy.current) return
    busy.current = true
    setSaving(true)
    setSaveError(null)
    try {
      await listApi.saveRecipe(recipe)
      setReviewOpen(false)
      setRecipes([])
      return true
    } catch (cause: any) {
      setSaveError(cause?.message || t('shoppingList:chef.saveFailed'))
      return false
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  return {
    selectedKeys,
    selectedProducts,
    toggleProduct,
    setSelectedKeys,
    servings,
    setServings,
    mealType,
    setMealType,
    preferences,
    setPreferences,
    chefMessage,
    setChefMessage,
    recipes,
    reviewOpen,
    setReviewOpen,
    generating,
    saving,
    error,
    saveError,
    generate,
    save
  }
}

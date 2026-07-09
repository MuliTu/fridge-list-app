import { useEffect, useState } from 'react'
import { categoriesRef, onValue, seedCategoriesIfEmpty } from '../lib/firebase'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { useIsPrerendering } from './useIsPrerendering'
import type { Category } from '../types'

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const isPrerendering = useIsPrerendering()

  useEffect(() => {
    if (isPrerendering) return
    seedCategoriesIfEmpty()
    return onValue(categoriesRef, (snapshot) => {
      const data = snapshot.val() || {}
      const list: Category[] = Object.entries(data as Record<string, any>).map(([key, entry]) => ({
        key,
        ...entry
      }))
      const orderOf = (c: Category) => (typeof c.order === 'number' ? c.order : Number.MAX_SAFE_INTEGER)
      list.sort((a, b) => {
        const diff = orderOf(a) - orderOf(b)
        if (diff !== 0) return diff
        return (a.name || '').localeCompare(b.name || '', 'he')
      })
      setCategories(list)
    })
  }, [isPrerendering])

  const categoryMap = new Map(categories.map((c) => [c.name, c]))
  const fallback = categories.find((c) => c.name === OTHER_CATEGORY_NAME)

  return { categories, categoryMap, fallback }
}

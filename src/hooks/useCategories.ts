import { useContext, useEffect, useState } from 'react'
import { LocalCategoriesContext } from './LocalCategoriesContext'
import { onValue } from '../lib/firebase'
import { OTHER_CATEGORY_NAME } from '../lib/categories'
import { useIsPrerendering } from './useIsPrerendering'
import { useActiveList } from './ListContext'
import type { Category } from '../types'

export function useCategories() {
  const localCategories = useContext(LocalCategoriesContext)
  const [categories, setCategories] = useState<Category[]>([])
  const isPrerendering = useIsPrerendering()
  const { listApi } = useActiveList()

  useEffect(() => {
    if (localCategories || isPrerendering || !listApi) return
    setCategories([])
    listApi.seedCategoriesIfEmpty()
    return onValue(listApi.categoriesRef, (snapshot) => {
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
  }, [isPrerendering, listApi, localCategories])

  const resolvedCategories = localCategories ?? categories
  const categoryMap = new Map(resolvedCategories.map((c) => [c.name, c]))
  const fallback = resolvedCategories.find((c) => c.name === OTHER_CATEGORY_NAME)

  return { categories: resolvedCategories, categoryMap, fallback }
}

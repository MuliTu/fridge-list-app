import { useEffect, useState } from 'react'
import { categoriesRef, onValue, seedCategoriesIfEmpty } from './firebase.js'
import { OTHER_CATEGORY_NAME } from './categories.js'

export function useCategories() {
  const [categories, setCategories] = useState([])

  useEffect(() => {
    seedCategoriesIfEmpty()
    return onValue(categoriesRef, (snapshot) => {
      const data = snapshot.val() || {}
      const list = Object.entries(data).map(([key, entry]) => ({ key, ...entry }))
      const orderOf = (c) => (typeof c.order === 'number' ? c.order : Number.MAX_SAFE_INTEGER)
      list.sort((a, b) => {
        const diff = orderOf(a) - orderOf(b)
        if (diff !== 0) return diff
        return (a.name || '').localeCompare(b.name || '', 'he')
      })
      setCategories(list)
    })
  }, [])

  const categoryMap = new Map(categories.map((c) => [c.name, c]))
  const fallback = categories.find((c) => c.name === OTHER_CATEGORY_NAME)

  return { categories, categoryMap, fallback }
}

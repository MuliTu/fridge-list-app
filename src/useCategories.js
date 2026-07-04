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
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he'))
      setCategories(list)
    })
  }, [])

  const categoryMap = new Map(categories.map((c) => [c.name, c]))
  const fallback = categories.find((c) => c.name === OTHER_CATEGORY_NAME)

  return { categories, categoryMap, fallback }
}

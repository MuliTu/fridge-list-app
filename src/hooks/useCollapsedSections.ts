import { useEffect, useState } from 'react'

const STORAGE_KEY = 'collapsedCategories'

const readStored = (storageKey: string): Set<string> => {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

export function useCollapsedSections(storageKey = STORAGE_KEY) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readStored(storageKey))

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify([...collapsed]))
  }, [collapsed, storageKey])

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const isCollapsed = (key: string) => collapsed.has(key)

  return { isCollapsed, toggle }
}

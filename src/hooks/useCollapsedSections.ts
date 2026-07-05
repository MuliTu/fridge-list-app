import { useEffect, useState } from 'react'

const STORAGE_KEY = 'collapsedCategories'

const readStored = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

export function useCollapsedSections() {
  const [collapsed, setCollapsed] = useState<Set<string>>(readStored)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]))
  }, [collapsed])

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

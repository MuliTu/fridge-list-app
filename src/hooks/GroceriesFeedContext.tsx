import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { groceriesRef, onValue } from '../lib/firebase'
import { useIsPrerendering } from './useIsPrerendering'
import type { GroceryItem } from '../types'

interface GroceriesFeedValue {
  entries: GroceryItem[]
  status: string
  toast: string | null
  isLoading: boolean
}

const GroceriesFeedContext = createContext<GroceriesFeedValue | null>(null)

// Single shared onValue subscription for /groceries, mounted once at the layout level so
// the "new item" toast and status line stay visible across every tab, not just the
// shopping list — matching the original single-component App.jsx behavior.
export function GroceriesFeedProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<GroceryItem[]>([])
  const [status, setStatus] = useState('מתחבר...')
  const [toast, setToast] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const knownKeys = useRef(new Set<string>())
  const firstLoad = useRef(true)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPrerendering = useIsPrerendering()

  useEffect(() => {
    if (isPrerendering) return
    const unsubscribe = onValue(
      groceriesRef,
      (snapshot) => {
        const data = snapshot.val() || {}
        const newlyAdded: string[] = []

        const nextEntries: GroceryItem[] = Object.entries(data as Record<string, any>).map(([key, entry]) => {
          const isFresh = !firstLoad.current && !knownKeys.current.has(key)
          if (isFresh) newlyAdded.push(entry.item)
          return { key, ...entry, isFresh }
        })

        knownKeys.current = new Set(Object.keys(data))

        if (newlyAdded.length > 0 && !firstLoad.current) {
          const message =
            newlyAdded.length === 1
              ? `נוסף: ${newlyAdded[0]}`
              : `נוספו ${newlyAdded.length} פריטים: ${newlyAdded.join(', ')}`
          setToast(message)
          if (toastTimer.current) clearTimeout(toastTimer.current)
          toastTimer.current = setTimeout(() => setToast(null), 4500)
        }

        firstLoad.current = false
        setIsLoading(false)
        setEntries(nextEntries)
        setStatus('עודכן לאחרונה: ' + new Date().toLocaleTimeString('he-IL'))
      },
      (error) => {
        setStatus('שגיאת חיבור: ' + error.message)
      }
    )

    return () => {
      unsubscribe()
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [isPrerendering])

  return <GroceriesFeedContext.Provider value={{ entries, status, toast, isLoading }}>{children}</GroceriesFeedContext.Provider>
}

export function useGroceriesFeed() {
  const ctx = useContext(GroceriesFeedContext)
  if (!ctx) throw new Error('useGroceriesFeed must be used within GroceriesFeedProvider')
  return ctx
}

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createDataCapabilitiesClient } from '../client/api/dataCapabilities'
import { createGroceryApiClient } from '../client/api/groceries'
import { getCurrentUserIdToken, onValue } from '../lib/firebase'
import { useIsPrerendering } from './useIsPrerendering'
import { useActiveList } from './ListContext'
import type { GroceryItem } from '../types'

interface GroceriesFeedValue {
  entries: GroceryItem[]
  status: string
  toast: string | null
  isLoading: boolean
}

const GroceriesFeedContext = createContext<GroceriesFeedValue | null>(null)

// Single shared onValue subscription for the active list's /groceries, mounted once
// at the layout level so the "new item" toast and status line stay visible across
// every tab, not just the shopping list. Re-subscribes whenever the active list
// changes (switching households) — knownKeys/firstLoad reset too, so a fresh list's
// existing items never get mistaken for "newly added" and trigger a toast.
export function GroceriesFeedProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<GroceryItem[]>([])
  const [status, setStatus] = useState('מתחבר...')
  const [toast, setToast] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const knownKeys = useRef(new Set<string>())
  const firstLoad = useRef(true)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPrerendering = useIsPrerendering()
  const { activeList, listApi } = useActiveList()
  const activeListId = activeList?.id

  useEffect(() => {
    if (isPrerendering || !listApi || !activeListId) return
    knownKeys.current = new Set()
    firstLoad.current = true
    setEntries([])
    setIsLoading(true)
    setStatus('מתחבר...')

    let cancelled = false
    let cleanupFeed: (() => void) | null = null

    const publishEntries = (nextEntries: GroceryItem[]) => {
      const newlyAdded: string[] = []
      const nextKnownKeys = new Set<string>()

      const entriesWithFreshness = nextEntries.map((entry) => {
        nextKnownKeys.add(entry.key)
        const isFresh = !firstLoad.current && !knownKeys.current.has(entry.key)
        if (isFresh) newlyAdded.push(entry.item)
        return { ...entry, isFresh }
      })

      knownKeys.current = nextKnownKeys

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
      setEntries(entriesWithFreshness)
      setStatus('עודכן לאחרונה: ' + new Date().toLocaleTimeString('he-IL'))
    }

    const startFirebaseFeed = () => {
      cleanupFeed = onValue(
        listApi.groceriesRef,
        (snapshot) => {
          if (cancelled) return
          const data = snapshot.val() || {}
          publishEntries(
            Object.entries(data as Record<string, Omit<GroceryItem, 'key'>>).map(
              ([key, entry]) => ({ key, ...entry })
            )
          )
        },
        (error) => {
          if (!cancelled) setStatus('שגיאת חיבור: ' + error.message)
        }
      )
    }

    const startRdsFeed = () => {
      const groceries = createGroceryApiClient({ getIdToken: getCurrentUserIdToken })
      let refreshInFlight = false

      const refresh = async () => {
        if (refreshInFlight) return
        refreshInFlight = true
        try {
          const records = await groceries.list(activeListId)
          if (!cancelled) publishEntries(records)
        } catch (error) {
          if (!cancelled) {
            const message = error instanceof Error ? error.message : 'unknown error'
            setStatus('שגיאת חיבור: ' + message)
            setIsLoading(false)
          }
        } finally {
          refreshInFlight = false
        }
      }

      void refresh()
      const onFocus = () => {
        void refresh()
      }
      window.addEventListener('focus', onFocus)
      cleanupFeed = () => window.removeEventListener('focus', onFocus)
    }

    const capabilities = createDataCapabilitiesClient({
      getIdToken: getCurrentUserIdToken
    })

    void capabilities
      .get()
      .then((dataCapabilities) => {
        if (cancelled) return
        if (dataCapabilities.groceries.reads === 'rds') {
          startRdsFeed()
          return
        }
        startFirebaseFeed()
      })
      .catch(() => {
        if (!cancelled) startFirebaseFeed()
      })

    return () => {
      cancelled = true
      cleanupFeed?.()
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [isPrerendering, listApi, activeListId])

  return <GroceriesFeedContext.Provider value={{ entries, status, toast, isLoading }}>{children}</GroceriesFeedContext.Provider>
}

export function useGroceriesFeed() {
  const ctx = useContext(GroceriesFeedContext)
  if (!ctx) throw new Error('useGroceriesFeed must be used within GroceriesFeedProvider')
  return ctx
}

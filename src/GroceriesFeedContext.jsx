import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { groceriesRef, onValue } from './firebase.js'

const GroceriesFeedContext = createContext(null)

// Single shared onValue subscription for /groceries, mounted once at the layout level so
// the "new item" toast and status line stay visible across every tab, not just the
// shopping list — matching the original single-component App.jsx behavior.
export function GroceriesFeedProvider({ children }) {
  const [entries, setEntries] = useState([])
  const [status, setStatus] = useState('מתחבר...')
  const [toast, setToast] = useState(null)
  const knownKeys = useRef(new Set())
  const firstLoad = useRef(true)
  const toastTimer = useRef(null)

  useEffect(() => {
    const unsubscribe = onValue(
      groceriesRef,
      (snapshot) => {
        const data = snapshot.val() || {}
        const newlyAdded = []

        const nextEntries = Object.entries(data).map(([key, entry]) => {
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
  }, [])

  return (
    <GroceriesFeedContext.Provider value={{ entries, status, toast }}>{children}</GroceriesFeedContext.Provider>
  )
}

export function useGroceriesFeed() {
  return useContext(GroceriesFeedContext)
}

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_BEHAVIOR, normalizeBehavior, type BehaviorSettings } from '../lib/behaviorSettings'

const BehaviorContext = createContext({
  settings: DEFAULT_BEHAVIOR,
  update: (_patch: Partial<BehaviorSettings>) => {},
  saveError: false
})
const storageKey = (scope: string) => `fridge-behavior-v1:${scope}`
const read = (scope: string) => {
  try { return normalizeBehavior(JSON.parse(localStorage.getItem(storageKey(scope)) || 'null')) }
  catch { return { ...DEFAULT_BEHAVIOR } }
}

// Mount with key={scope} so switching users never renders the previous user's settings.
export function BehaviorSettingsProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const [settings, setSettings] = useState(() => read(scope))
  const [saveError, setSaveError] = useState(false)
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey(scope) || event.key === null) setSettings(read(scope))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [scope])
  const update = (patch: Partial<BehaviorSettings>) => {
    setSettings(previous => {
      const next = normalizeBehavior({ ...previous, ...patch })
      try { localStorage.setItem(storageKey(scope), JSON.stringify(next)); setSaveError(false) }
      catch { setSaveError(true) }
      return next
    })
  }
  return <BehaviorContext.Provider value={{ settings, update, saveError }}>{children}</BehaviorContext.Provider>
}
export const useBehaviorSettings = () => useContext(BehaviorContext)

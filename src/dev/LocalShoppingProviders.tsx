import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext } from '../hooks/AuthContext'
import { ListContext, useListApi } from '../hooks/ListContext'
import { GroceriesFeedContext } from '../hooks/GroceriesFeedContext'
import { BoughtItemsPreferenceContext } from '../hooks/BoughtItemsPreferenceContext'
import { LocalCategoriesContext } from '../hooks/LocalCategoriesContext'
import { createShoppingMockData, mockCategories } from './shoppingMockData'
import type { Category, GroceryItem } from '../types'

const STORAGE_KEY = 'fridge-integrated-shopping-mock-v2'
type LocalApi = ReturnType<typeof useListApi>
type LocalMethods = {
  [Key in keyof LocalApi]?: LocalApi[Key] extends (...args: infer Args) => unknown
    ? (...args: Args) => PromiseLike<unknown>
    : never
}

// Used only by Layout's DEV + VITE_DEV_MOCK_DATA branch on the shopping route.
// No Firebase list provider or realtime feed is mounted in this branch.
export default function LocalShoppingProviders({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<GroceryItem[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
      return Array.isArray(stored) ? stored : createShoppingMockData()
    } catch { return createShoppingMockData() }
  })
  const [categories, setCategories] = useState<Category[]>(mockCategories)
  const [keepBought, setKeepBought] = useState(false)
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch {}
  }, [entries])

  const listApi = useMemo(() => {
    const patch = (key: string, fields: Partial<GroceryItem>) => {
      setEntries(previous => previous.map(entry => entry.key === key ? { ...entry, ...fields } : entry))
      return Promise.resolve()
    }
    const methods: LocalMethods = {
      setBought: (entry, bought) => patch(entry.key, { bought }),
      addGroceryItem: async (item, listName) => {
        const key = crypto.randomUUID()
        setEntries(previous => [...previous, {
          key, item: item.name, category: item.category, bought: false,
          list_name: listName, quantity: item.quantity, unit: item.unit, note: item.note,
          added_at: new Date().toISOString(), created_by: 'דמו מקומי'
        }])
        return { key }
      },
      deleteItem: async key => { setEntries(previous => previous.filter(entry => entry.key !== key)) },
      deleteGroceryList: async listName => { setEntries(previous => previous.filter(entry => (entry.list_name ?? null) !== listName)) },
      updateGroceryItemCategory: (key, category) => patch(key, { category }),
      updateGroceryItemUrgency: (key, urgency) => patch(key, { urgency }),
      updateGroceryItemName: (key, name) => patch(key, { item: name }),
      updateGroceryItemQuantity: (key, fields) => patch(key, fields),
      saveItemDetails: (key, details) => patch(key, {
        ...(details.name === undefined ? {} : { item: details.name }),
        ...(details.note === undefined ? {} : { note: details.note }),
        ...(details.quantity === undefined ? {} : { quantity: details.quantity }),
        ...(details.unit === undefined ? {} : { unit: details.unit })
      }),
      addCategory: async category => { setCategories(previous => [...previous, { ...category, key: crypto.randomUUID(), icon: category.icon ?? '📌', protected: false }]) },
      // Suppress inventory prompts in the local shopping fixture.
      findStockItemByName: () => Promise.reject(new Error('Inventory is unavailable in shopping mock mode'))
    }
    // Unimplemented actions fail locally instead of falling through to real APIs.
    return new Proxy(methods, {
      get(target, property) {
        if (property in target) return target[property as keyof typeof methods]
        return () => Promise.reject(new Error('הפעולה אינה זמינה בנתוני הדמו המקומיים'))
      }
    }) as unknown as LocalApi
  }, [])
  const household = { id: 'local-shopping-mock', owner: 'local-shopping-mock', name: 'רשימות דמו מקומיות', status: 'approved' as const }
  return <AuthContext.Provider value={{ user: { email: null, displayName: 'דמו מקומי' }, authResolved: true, authError: null, onSignIn: async () => {}, onSignOut: async () => {} }}>
    <ListContext.Provider value={{ myLists: [household], activeList: household, listsResolved: true, listsError: null, canEdit: true, canView: true, isOwner: false, listApi, setActiveListId: () => {}, renameActiveList: async () => {} }}>
      <LocalCategoriesContext.Provider value={categories}>
        <BoughtItemsPreferenceContext.Provider value={{ keepBoughtItemsInCategories: keepBought, isResolved: true, saveError: false, toggleBoughtItemsPlacement: async () => setKeepBought(previous => !previous) }}>
          <GroceriesFeedContext.Provider value={{ entries, status: 'נתוני דמו · נשמרים בדפדפן בלבד', toast: null, isLoading: false }}>{children}</GroceriesFeedContext.Provider>
        </BoughtItemsPreferenceContext.Provider>
      </LocalCategoriesContext.Provider>
    </ListContext.Provider>
  </AuthContext.Provider>
}

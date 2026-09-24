import { createContext, useContext, useState, type ReactNode } from 'react'

// The custom/temporary-list management actions (new list, import, share what's
// missing, delete list) live in the sidebar now (Layout.tsx), but the state and
// handlers they need only exist inside the shopping-list route (routes/index.tsx —
// they depend on that route's ?list= search param, live grocery entries, etc.).
// Layout wraps every route, so it can't reach into a child route's local state
// directly — this context lets the shopping-list route register its current
// actions into a slot the sidebar (an ancestor) can read. `actions` stays null on
// every other route (stock, receipts), which is exactly the signal the sidebar
// uses to hide this section entirely when it doesn't apply.
export type ListPickerActions = {
  canEdit: boolean
  isCustomList: boolean
  hasUnbought: boolean
  onCreateList: () => void
  onDeleteList: () => void
  onShareMissing: () => void
  onBulkUpload: () => void
}

type ListPickerActionsContextValue = {
  actions: ListPickerActions | null
  setActions: (actions: ListPickerActions | null) => void
}

const ListPickerActionsContext = createContext<ListPickerActionsContextValue | null>(null)

export const ListPickerActionsProvider = ({ children }: { children: ReactNode }) => {
  const [actions, setActions] = useState<ListPickerActions | null>(null)
  return (
    <ListPickerActionsContext.Provider value={{ actions, setActions }}>
      {children}
    </ListPickerActionsContext.Provider>
  )
}

export const useListPickerActions = () => {
  const ctx = useContext(ListPickerActionsContext)
  if (!ctx) throw new Error('useListPickerActions must be used within ListPickerActionsProvider')
  return ctx
}

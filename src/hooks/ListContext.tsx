import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createList as createListInFirebase, createListApi, onValue, userListsRef, type ListApi } from '../lib/firebase'
import { useIsPrerendering } from './useIsPrerendering'
import { useAuth } from './AuthContext'
import type { UserList } from '../types'

const ACTIVE_LIST_STORAGE_KEY = 'activeListId'

interface ListContextValue {
  myLists: UserList[]
  // True once the reverse-index read for the signed-in user has resolved at least
  // once (or immediately for a signed-out user) — lets Layout distinguish "still
  // checking whether this user has any lists" from "confirmed, they have zero".
  listsResolved: boolean
  // Set on a read error (e.g. /users has no RTDB rule applied yet) — surfaced
  // instead of leaving the UI stuck on "checking your lists" forever, since a
  // permission-denied onValue subscription never calls its success callback at all.
  listsError: string | null
  activeList: UserList | null
  setActiveListId: (id: string | null) => void
  createList: (name: string) => Promise<void>
  isOwner: boolean
  // Membership in the active list — narrower than the old global canEdit/canView
  // (see AuthContext.tsx), but both collapse to the same boolean today since there's
  // still no separate viewer tier, same as before.
  canEdit: boolean
  canView: boolean
  listApi: ListApi | null
}

const ListContext = createContext<ListContextValue | null>(null)

export function ListProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const isPrerendering = useIsPrerendering()
  const [myLists, setMyLists] = useState<UserList[]>([])
  const [listsResolved, setListsResolved] = useState(false)
  const [listsError, setListsError] = useState<string | null>(null)
  const [activeListId, setActiveListIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_LIST_STORAGE_KEY)
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (isPrerendering) return
    if (!user?.email) {
      setMyLists([])
      setListsResolved(true)
      setListsError(null)
      return
    }
    setListsResolved(false)
    setListsError(null)
    return onValue(
      userListsRef(user.email),
      (snapshot) => {
        const data = snapshot.val() || {}
        const lists: UserList[] = Object.entries(data as Record<string, { name: string; owner: string }>).map(
          ([id, entry]) => ({ id, name: entry.name, owner: entry.owner })
        )
        setMyLists(lists)
        setListsResolved(true)
      },
      (error) => {
        setMyLists([])
        setListsResolved(true)
        setListsError(error.message)
      }
    )
  }, [user?.email, isPrerendering])

  // Keep the active list valid: fall back to the first available list if the
  // stored/previous choice is no longer one this user belongs to (removed as a
  // member, or first load with nothing stored yet and exactly one list to default
  // to). Never auto-picks among several — a user with multiple lists keeps whatever
  // they last had active until they explicitly switch via the header dropdown.
  useEffect(() => {
    if (!listsResolved) return
    if (activeListId && myLists.some((l) => l.id === activeListId)) return
    const fallback = myLists.length > 0 ? myLists[0].id : null
    setActiveListIdState(fallback)
    try {
      if (fallback) localStorage.setItem(ACTIVE_LIST_STORAGE_KEY, fallback)
      else localStorage.removeItem(ACTIVE_LIST_STORAGE_KEY)
    } catch {
      // localStorage unavailable (private browsing, etc.) — activeListId still works
      // for this session via state, it just won't persist across reloads.
    }
  }, [listsResolved, myLists, activeListId])

  const setActiveListId = (id: string | null) => {
    setActiveListIdState(id)
    try {
      if (id) localStorage.setItem(ACTIVE_LIST_STORAGE_KEY, id)
      else localStorage.removeItem(ACTIVE_LIST_STORAGE_KEY)
    } catch {
      // ignore — see above
    }
  }

  const createList = async (name: string) => {
    if (!user?.email) return
    const id = await createListInFirebase(name, user.email)
    setActiveListId(id)
  }

  const activeList = myLists.find((l) => l.id === activeListId) || null
  const isOwner = !!activeList && !!user?.email && activeList.owner === user.email
  // Membership is implied by activeList existing at all — myLists only ever
  // contains lists this user's reverse-index entry says they belong to.
  const canEdit = !!activeList
  const canView = canEdit

  // Memoized so consumers' effects (e.g. GroceriesFeedContext's onValue subscription)
  // that depend on `listApi` only re-run when the active list actually changes, not
  // on every unrelated ListProvider re-render — createListApi() builds fresh ref()/
  // closure objects each call, which would otherwise be a new identity every time.
  const listApi = useMemo(() => (activeListId ? createListApi(activeListId) : null), [activeListId])

  return (
    <ListContext.Provider
      value={{
        myLists,
        listsResolved,
        listsError,
        activeList,
        setActiveListId,
        createList,
        isOwner,
        canEdit,
        canView,
        listApi
      }}
    >
      {children}
    </ListContext.Provider>
  )
}

export function useActiveList() {
  const ctx = useContext(ListContext)
  if (!ctx) throw new Error('useActiveList must be used within ListProvider')
  return ctx
}

// Convenience accessor for the grocery/stock/receipt/category read/write API scoped
// to whichever list is currently active. Throws if called with no active list —
// every consumer of this only ever mounts once Layout has confirmed an active list
// exists (see Layout.tsx's onboarding gate), so a null here means a real bug, not an
// expected transient state worth handling gracefully.
export function useListApi(): ListApi {
  const { listApi } = useActiveList()
  if (!listApi) throw new Error('useListApi called with no active list')
  return listApi
}

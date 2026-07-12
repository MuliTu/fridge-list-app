import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  approvePendingInvites,
  createListApi,
  ensureOwnList,
  memberOfRef,
  onValue,
  renameOwnList,
  userNameRef,
  type ListApi
} from '../lib/firebase'
import { useIsPrerendering } from './useIsPrerendering'
import { useAuth } from './AuthContext'
import type { UserList } from '../types'

const ACTIVE_LIST_STORAGE_KEY = 'activeListId'

interface ListContextValue {
  myLists: UserList[]
  // True once this user's own list + memberOf discovery have both resolved at
  // least once (or immediately for a signed-out user) — lets Layout distinguish
  // "still checking" from "confirmed" without ever needing a "create a list"
  // onboarding screen, since every signed-in user always has their own list.
  listsResolved: boolean
  // Set on a read error (e.g. /users has no RTDB rule applied yet) — surfaced
  // instead of leaving the UI stuck on "checking your lists" forever, since a
  // permission-denied onValue subscription never calls its success callback at all.
  listsError: string | null
  activeList: UserList | null
  setActiveListId: (id: string | null) => void
  renameActiveList: (name: string) => Promise<void>
  isOwner: boolean
  // Both a pending and an approved membership already grant access (see
  // firebase.ts's Lists section) — there's still no separate viewer tier, same as
  // the flat canEdit/canView this replaced in AuthContext.
  canEdit: boolean
  canView: boolean
  listApi: ListApi | null
}

const ListContext = createContext<ListContextValue | null>(null)

export function ListProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const isPrerendering = useIsPrerendering()
  const [ownName, setOwnName] = useState<string | null>(null)
  // Raw snapshot of /users/{me}/memberOf — { sanitizedOwnerKey: 'pending'|'approved' }.
  const [memberOf, setMemberOf] = useState<Record<string, string>>({})
  // Resolved separately (see effect below): each memberOf owner's display name,
  // fetched one-shot per owner since Firebase can't join across keys server-side.
  const [memberNames, setMemberNames] = useState<Record<string, string>>({})
  const [listsResolved, setListsResolved] = useState(false)
  const [listsError, setListsError] = useState<string | null>(null)
  const [activeListId, setActiveListIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_LIST_STORAGE_KEY)
    } catch {
      return null
    }
  })

  // Provisions this user's own list (idempotent — no-ops if they already have one)
  // and flips any of their pending invites to approved, once per session, before
  // subscribing to live data. Both are cheap, safe to re-run, and this is the only
  // place either needs to be called from.
  useEffect(() => {
    if (isPrerendering || !user?.email) return
    let cancelled = false
    ensureOwnList(user.email, user.displayName).catch((err) => {
      if (!cancelled) setListsError(err.message)
    })
    approvePendingInvites(user.email).catch(() => {
      // Best-effort — a failed flip just means the entry stays 'pending' a bit
      // longer (still grants access either way, see firebase.ts), not worth
      // surfacing as a hard error on top of whatever ensureOwnList reports.
    })
    return () => {
      cancelled = true
    }
  }, [user?.email, isPrerendering])

  useEffect(() => {
    if (isPrerendering) return
    if (!user?.email) {
      setOwnName(null)
      setMemberOf({})
      setMemberNames({})
      setListsResolved(true)
      setListsError(null)
      return
    }
    setListsResolved(false)
    setListsError(null)
    let ownResolved = false
    let memberOfResolved = false
    const maybeResolved = () => {
      if (ownResolved && memberOfResolved) setListsResolved(true)
    }
    const onError = (error: Error) => {
      setListsError(error.message)
      setListsResolved(true)
    }

    const unsubName = onValue(
      userNameRef(user.email),
      (snapshot) => {
        setOwnName(snapshot.val() || null)
        ownResolved = true
        maybeResolved()
      },
      onError
    )
    const unsubMemberOf = onValue(
      memberOfRef(user.email),
      (snapshot) => {
        setMemberOf(snapshot.val() || {})
        memberOfResolved = true
        maybeResolved()
      },
      onError
    )

    return () => {
      unsubName()
      unsubMemberOf()
    }
  }, [user?.email, isPrerendering])

  // memberOf only holds { ownerKey: status } — fetch each owner's display name
  // one-shot whenever the set of owners changes (a new invite appears/disappears),
  // not on every render. Sanitized keys are safe to pass straight into
  // userNameRef (see its idempotency note in firebase.ts).
  const memberOfKeys = Object.keys(memberOf).sort().join(',')
  useEffect(() => {
    const keys = memberOfKeys ? memberOfKeys.split(',') : []
    if (keys.length === 0) {
      setMemberNames({})
      return
    }
    let cancelled = false
    Promise.all(
      keys.map((key) =>
        new Promise<[string, string]>((resolve) => {
          const unsub = onValue(
            userNameRef(key),
            (snapshot) => {
              unsub()
              resolve([key, snapshot.val() || key])
            },
            () => {
              unsub()
              resolve([key, key])
            }
          )
        })
      )
    ).then((entries) => {
      if (!cancelled) setMemberNames(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [memberOfKeys])

  const myLists: UserList[] = useMemo(() => {
    if (!user?.email) return []
    const list: UserList[] = []
    if (ownName) list.push({ id: user.email, name: ownName, owner: user.email, status: 'owner' })
    Object.entries(memberOf).forEach(([ownerKey, status]) => {
      list.push({
        id: ownerKey,
        name: memberNames[ownerKey] || ownerKey,
        owner: ownerKey,
        status: status === 'approved' ? 'approved' : 'pending'
      })
    })
    return list
  }, [user?.email, ownName, memberOf, memberNames])

  // Keep the active list valid: fall back to the user's own list if the
  // stored/previous choice is no longer one they belong to (e.g. removed as a
  // member). Never auto-switches away from a valid choice otherwise.
  useEffect(() => {
    if (!listsResolved || !user?.email) return
    if (activeListId && myLists.some((l) => l.id === activeListId)) return
    const fallback = user.email
    setActiveListIdState(fallback)
    try {
      localStorage.setItem(ACTIVE_LIST_STORAGE_KEY, fallback)
    } catch {
      // localStorage unavailable (private browsing, etc.) — activeListId still
      // works for this session via state, it just won't persist across reloads.
    }
  }, [listsResolved, myLists, activeListId, user?.email])

  const setActiveListId = (id: string | null) => {
    setActiveListIdState(id)
    try {
      if (id) localStorage.setItem(ACTIVE_LIST_STORAGE_KEY, id)
      else localStorage.removeItem(ACTIVE_LIST_STORAGE_KEY)
    } catch {
      // ignore — see above
    }
  }

  const renameActiveList = async (name: string) => {
    if (!user?.email) return
    await renameOwnList(user.email, name)
  }

  const activeList = myLists.find((l) => l.id === activeListId) || null
  const isOwner = activeList?.status === 'owner'
  // Membership is implied by activeList existing at all — myLists only ever
  // contains the user's own list plus owners who have (pending or approved)
  // invited them.
  const canEdit = !!activeList
  const canView = canEdit

  // Memoized so consumers' effects (e.g. GroceriesFeedContext's onValue
  // subscription) that depend on `listApi` only re-run when the active list
  // actually changes, not on every unrelated ListProvider re-render —
  // createListApi() builds fresh ref()/closure objects each call, which would
  // otherwise be a new identity every time.
  const listApi = useMemo(() => (activeListId ? createListApi(activeListId) : null), [activeListId])

  return (
    <ListContext.Provider
      value={{
        myLists,
        listsResolved,
        listsError,
        activeList,
        setActiveListId,
        renameActiveList,
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
// every consumer of this only ever mounts once a signed-in user's own list has
// resolved (always true almost immediately, since it's auto-provisioned), so a
// null here means a real bug, not an expected transient state worth handling
// gracefully.
export function useListApi(): ListApi {
  const { listApi } = useActiveList()
  if (!listApi) throw new Error('useListApi called with no active list')
  return listApi
}

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  approvePendingInvites,
  createListApi,
  getCurrentUserIdToken,
  ensureOwnList,
  memberOfRef,
  onValue,
  renameOwnList,
  userNameRef,
  type ListApi
} from '../lib/firebase'
import { createGroceryApiClient } from '../client/api/groceries'
import { useIsPrerendering } from './useIsPrerendering'
import { useAuth } from './AuthContext'
import type { AuthUser, UserList } from '../types'
import { normalizeName } from '../lib/normalizeName'

const ACTIVE_LIST_STORAGE_KEY = 'activeListId'
// MM19's list-membership adapter is the final runtime dependency for server
// grocery commands. This build-time switch supports a safe staged rollout and
// immediate rollback while the realtime Firebase read projection remains intact.
const GROCERY_COMMAND_API_ENABLED =
  import.meta.env.VITE_GROCERY_COMMAND_API_ENABLED === 'true'

type ActiveListApi = Omit<ListApi, 'addGroceryItem'> & {
  addGroceryItem(
    item: {
      name: string
      category: string
      quantity?: number | null
      unit?: string | null
    },
    listName: string | null,
    user?: AuthUser | null
  ): PromiseLike<unknown>
}

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
  listApi: ActiveListApi | null
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

  // Provisions this user's own list (idempotent — no-ops if they already have one),
  // flips any of their pending invites to approved, and only THEN subscribes to
  // live data. This ordering matters: subscribing before ensureOwnList's write
  // lands means the subscription's very first snapshot can arrive empty (no
  // `name` yet), which would flip listsResolved to true with myLists still empty
  // for a genuinely brand-new user — confirmed happening in production. Doing
  // both provisioning calls first and awaiting the name one guarantees the first
  // subscription snapshot already reflects the provisioned name.
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

    let cancelled = false
    let unsubName: (() => void) | null = null
    let unsubMemberOf: (() => void) | null = null
    setListsResolved(false)
    setListsError(null)

    ;(async () => {
      const email = user.email as string
      try {
        await ensureOwnList(email, user.displayName)
      } catch (err: any) {
        if (!cancelled) {
          setListsError(err.message)
          setListsResolved(true)
        }
        return
      }
      // Best-effort — a failed flip just means the entry stays 'pending' a bit
      // longer (still grants access either way, see firebase.ts), not worth
      // blocking or failing the rest of this on.
      approvePendingInvites(email).catch(() => {})
      if (cancelled) return

      let ownResolved = false
      let memberOfResolved = false
      const maybeResolved = () => {
        if (ownResolved && memberOfResolved) setListsResolved(true)
      }
      const onError = (error: Error) => {
        setListsError(error.message)
        setListsResolved(true)
      }

      unsubName = onValue(
        userNameRef(email),
        (snapshot) => {
          setOwnName(snapshot.val() || null)
          ownResolved = true
          maybeResolved()
        },
        onError
      )
      unsubMemberOf = onValue(
        memberOfRef(email),
        (snapshot) => {
          setMemberOf(snapshot.val() || {})
          memberOfResolved = true
          maybeResolved()
        },
        onError
      )
    })()

    return () => {
      cancelled = true
      unsubName?.()
      unsubMemberOf?.()
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

  // The list actually used for rendering — derived synchronously every render,
  // not solely from `activeListId` state. This matters: `listsResolved` and
  // `myLists` can both become correct within the same render pass (React 18
  // batches the onValue callbacks' setState calls), but fixing an invalid/missing
  // `activeListId` used to happen in a separate effect one render later — a real
  // gap where Layout had already decided to render {children} (listsResolved
  // true, no error) while `activeListId`/`listApi` were still null, crashing any
  // child that called useListApi() during that frame (confirmed in production).
  // Falling back here instead means there's never a render where myLists is
  // non-empty but the resolved active list is null.
  const resolvedActiveListId =
    activeListId && myLists.some((l) => l.id === activeListId) ? activeListId : myLists[0]?.id ?? null

  // Persist a corrected/initial choice for next session — purely a side effect on
  // localStorage + the stored preference; rendering above never waits on this.
  useEffect(() => {
    if (!listsResolved || resolvedActiveListId === activeListId) return
    setActiveListIdState(resolvedActiveListId)
    try {
      if (resolvedActiveListId) localStorage.setItem(ACTIVE_LIST_STORAGE_KEY, resolvedActiveListId)
      else localStorage.removeItem(ACTIVE_LIST_STORAGE_KEY)
    } catch {
      // localStorage unavailable (private browsing, etc.) — activeListId still
      // works for this session via state, it just won't persist across reloads.
    }
  }, [listsResolved, resolvedActiveListId, activeListId])

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

  const activeList = myLists.find((l) => l.id === resolvedActiveListId) || null
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
  const listApi = useMemo(
    () => {
      if (!resolvedActiveListId) return null
      const legacy = createListApi(resolvedActiveListId)
      if (!GROCERY_COMMAND_API_ENABLED) return legacy

      const commands = createGroceryApiClient({ getIdToken: getCurrentUserIdToken })
      return {
        ...legacy,
        setBought: (
          entry: Parameters<ListApi['setBought']>[0],
          bought: boolean,
          _mutationUser?: AuthUser | null
        ) => commands.setPurchased(resolvedActiveListId, entry.key, bought),
        updateGroceryItemCategory: (key: string, category: string, _mutationUser?: AuthUser | null) =>
          commands.update(resolvedActiveListId, key, { category }),
        saveItemDetails: async (
          key: string,
          details: {
            name?: string
            note?: string | null
            imageFile?: File | null
            quantity?: number | null
            unit?: string | null
          },
          mutationUser?: AuthUser | null
        ) => {
          if (details.imageFile) return legacy.saveItemDetails(key, details, mutationUser)
          const previous = details.name == null
            ? null
            : (await legacy.getAllGroceryItems()).find((candidate) => candidate.key === key)
          await commands.update(resolvedActiveListId, key, details)
          if (
            details.name != null &&
            previous &&
            normalizeName(previous.item) !== normalizeName(details.name)
          ) {
            await legacy.recordListChange({
              type: 'renamed',
              itemKey: key,
              itemName: details.name,
              previousName: previous.item,
              listName: previous.list_name ?? null,
              changedBy: mutationUser?.email ?? null
            })
          }
        },
        updateGroceryItemName: async (key: string, name: string, mutationUser?: AuthUser | null) => {
          const entry = (await legacy.getAllGroceryItems()).find((candidate) => candidate.key === key)
          if (!entry || normalizeName(entry.item) === normalizeName(name)) return
          await commands.update(resolvedActiveListId, key, { name })
          await legacy.recordListChange({
            type: 'renamed',
            itemKey: key,
            itemName: name,
            previousName: entry.item,
            listName: entry.list_name ?? null,
            changedBy: mutationUser?.email ?? null
          })
        },
        deleteItem: async (key: string, imageRef?: string | null, mutationUser?: AuthUser | null) => {
          if (imageRef) return legacy.deleteItem(key, imageRef, mutationUser)
          const entry = (await legacy.getAllGroceryItems()).find((candidate) => candidate.key === key)
          await commands.delete(resolvedActiveListId, key)
          if (entry) {
            await legacy.recordListChange({
              type: 'removed',
              itemKey: key,
              itemName: entry.item,
              listName: entry.list_name ?? null,
              changedBy: mutationUser?.email ?? null
            })
          }
        },
        addGroceryItem: async (
          item: {
            name: string
            category: string
            quantity?: number | null
            unit?: string | null
          },
          listName: string | null,
          mutationUser?: AuthUser | null
        ) => {
          const created = await commands.add(resolvedActiveListId, { ...item, listName })
          await legacy.recordListChange({
            type: 'added',
            itemKey: created.key,
            itemName: item.name,
            listName,
            changedBy: mutationUser?.email ?? null
          })
          return created
        }
      }
    },
    [resolvedActiveListId]
  )

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
export function useListApi(): ActiveListApi {
  const { listApi } = useActiveList()
  if (!listApi) throw new Error('useListApi called with no active list')
  return listApi
}

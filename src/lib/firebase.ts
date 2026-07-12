import { initializeApp } from 'firebase/app'
import { getDatabase, ref, onValue, get, push, set, update, remove } from 'firebase/database'
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore'
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_NAME } from './categories'
import { logger } from './logger'
import { normalizeName } from './normalizeName'
import { isSafeHttpUrl } from './safeUrl'
import { StockUnit } from './units'
import type { AuthUser, GroceryItem, ReceiptItem, StockItem } from '../types'
import { version as APP_VERSION } from '../../package.json'

// Logs client-side actions (grocery/stock/receipt/category/list writes) to the
// browser console AND forwards them to the dev server's terminal via /api/client-log
// — these are Firebase SDK calls made in the browser, so without that hop they'd
// never reach the terminal the way the scan-receipt/categorize-item route logs do.
// Fire-and-forget: a logging failure must never block the actual action.
const logClientAction = (message: string) => {
  logger.success(message)
  fetch('/api/client-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, level: 'success' })
  }).catch(() => {})
}

const firebaseConfig = {
  apiKey: 'AIzaSyAcwoGM2xPNBF372qI9kqVsp72kUG-Errs',
  authDomain: 'n8n-vocal-2-db.firebaseapp.com',
  databaseURL: 'https://n8n-vocal-2-db-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'n8n-vocal-2-db',
  appId: '1:32784605229:web:0375ee6a30d8bb5da5d8a4'
}

const app = initializeApp(firebaseConfig)
const db = getDatabase(app)
const auth = getAuth(app)
const firestore = getFirestore(app)
const googleProvider = new GoogleAuthProvider()

// The 4 server routes that proxy to n8n/Gemini or Trello (scan-receipt,
// scan-receipt-url, categorize-item, submit-feedback) now require a valid Firebase
// ID token server-side (see src/lib/verifyAuthToken.ts) — this attaches it. If
// there's no signed-in user (shouldn't normally happen, since these flows are already
// canEdit-gated in the UI) or getIdToken() itself fails, this returns an empty
// headers object rather than throwing — the fetch still goes out and the server
// naturally 401s it, matching this app's graceful-degradation house style (a failed
// scan/categorization/feedback-submit already degrades to a manual fallback or a
// recoverable error rather than a client-side crash).
const getAuthHeaders = async (): Promise<Record<string, string>> => {
  try {
    const token = await auth.currentUser?.getIdToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

// Firebase Storage requires the paid Blaze plan (confirmed unavailable for this
// project — both possible bucket names return NoSuchBucket). Firestore is free on
// the Spark plan, so images/PDFs are stored as base64 documents there instead of
// Storage blobs. Firestore caps documents at 1MiB; base64 inflates size by ~4/3, so
// this caps the raw file at a conservative 700KB, leaving room for the other fields.
const MAX_INLINE_IMAGE_BYTES = 700_000

export class ImageTooLargeError extends Error {
  constructor() {
    super('התמונה/הקובץ גדולים מדי לשמירה (מעל 700KB)')
  }
}

const saveImageDoc = async (collectionName: string, id: string, blob: Blob) => {
  if (blob.size > MAX_INLINE_IMAGE_BYTES) throw new ImageTooLargeError()
  const data = await blobToBase64(blob)
  await setDoc(doc(firestore, collectionName, id), {
    data,
    contentType: blob.type || 'application/octet-stream',
    uploaded_at: new Date().toISOString()
  })
}

export const getImageDataUrl = async (collectionName: string, id: string): Promise<string | null> => {
  const snapshot = await getDoc(doc(firestore, collectionName, id))
  if (!snapshot.exists()) return null
  const { data, contentType } = snapshot.data() as { data: string; contentType: string }
  return `data:${contentType};base64,${data}`
}

const deleteImageDoc = async (collectionName: string, id: string) => {
  try {
    await deleteDoc(doc(firestore, collectionName, id))
  } catch {
    // best-effort cleanup; still remove the owning record even if this fails
  }
}

export { onValue }

export const signIn = () => signInWithPopup(auth, googleProvider)
export const signOutUser = () => signOut(auth)
export const onAuthChange = (cb: (user: User | null) => void) => onAuthStateChanged(auth, cb)

export const resizeImage = (file: File | Blob, maxDim = 1280, quality = 0.75): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('image encode failed'))), 'image/jpeg', quality)
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => reject(new Error('image load failed'))
    img.src = URL.createObjectURL(file)
  })

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error('image read failed'))
    reader.readAsDataURL(blob)
  })

// Same-origin path, not the n8n URL directly — /api/categorize-item (a TanStack Start
// server route) keeps the webhook URL server-side only. Mirrors Siri's own
// extract-and-categorize Gemini prompt/category list, so manually typed items get the
// same categorization as voice-added ones. Free text can contain more than one item
// (e.g. "חלב ולחם"); returns [] if nothing relevant to a shopping list was found.
export const categorizeItem = async (text: string): Promise<{ item: string; category: string }[]> => {
  const response = await fetch('/api/categorize-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify({ text })
  })
  if (!response.ok) throw new Error('סיווג הפריט נכשל (' + response.status + ')')
  const data = await response.json()
  return data.items || []
}

// ---------------------------------------------------------------------------
// Lists (households): /users/{sanitizedOwnerEmail}
// ---------------------------------------------------------------------------
// No generated list ID — a list IS identified by its owner's email. Every signed-in
// user gets exactly one list, auto-provisioned at /users/{their email} the first
// time they sign in (see ensureOwnList, called from ListContext). All of that
// owner's grocery/stock/receipt/category data lives nested under that same node,
// scoped via createListApi() below.
//
// Invites are two mirrored pointers, both plain 'pending'|'approved' enum values
// (no denormalized name/owner on the pointer itself — a display name is looked up
// separately from the owner's own /users/{owner}/name when needed):
//   /users/{owner}/invites/{invitedEmail}   = 'pending' | 'approved'   (owner's view)
//   /users/{invitedEmail}/memberOf/{owner}  = 'pending' | 'approved'   (invitee's view)
// The invitee's copy exists purely so they can discover which owners invited them
// with a single read of their own node — without it, finding "who invited me" would
// mean scanning every user in the database, leaking every household's existence to
// everyone. Both a pending and an approved entry already grant access (this app's
// existing lightweight invite model — adding someone is the actual grant, matching
// how /admins worked before); 'pending' just means "invited but hasn't signed in
// with that email yet" and flips to 'approved' automatically the moment they do
// (see approvePendingInvites, also called from ListContext on first sign-in).
// Idempotent — safe to call with either a raw email or an already-sanitized key
// (trim/lowercase are no-ops on a sanitized string, and there are no more
// .#$[] characters left to replace). Every *Ref helper below relies on this:
// callers holding a sanitized key from a Firebase snapshot (e.g. memberOf's own
// keys) can pass it straight into userRef/userNameRef without re-deriving the raw
// email, which usually isn't recoverable from the key alone anyway.
export const sanitizeEmailKey = (email: string) => email.trim().toLowerCase().replace(/[.#$[\]]/g, '_')

export const userRef = (email: string) => ref(db, `users/${sanitizeEmailKey(email)}`)
export const userNameRef = (email: string) => ref(db, `users/${sanitizeEmailKey(email)}/name`)
export const memberOfRef = (email: string) => ref(db, `users/${sanitizeEmailKey(email)}/memberOf`)
export const invitesRef = (ownerEmail: string) => ref(db, `users/${sanitizeEmailKey(ownerEmail)}/invites`)

// Idempotent — only writes `name` if this user has never been provisioned as an
// owner before (a fresh /users/{email} node may already exist with nothing but a
// memberOf entry, written by someone else's invite, before this user ever signed
// in themselves — presence of `name` is what actually means "this is a real,
// initialized list", not mere existence of the node).
export const ensureOwnList = async (email: string, displayName?: string | null): Promise<string> => {
  const nameSnapshot = await get(userNameRef(email))
  if (nameSnapshot.exists()) return nameSnapshot.val()
  const name = displayName ? `הרשימה של ${displayName}` : 'הרשימה שלי'
  logClientAction(`[lists] ensureOwnList: owner=${email} name=${name}`)
  await set(userNameRef(email), name)
  return name
}

export interface InviteEntry {
  email: string
  status: 'pending' | 'approved'
}

// Called once per session after sign-in resolves: flips every 'pending' entry in
// this user's own memberOf map (and the owner's mirrored invites entry) to
// 'approved'. A no-op multi-path update when there's nothing pending — cheap to
// call unconditionally rather than tracking "have I already done this".
export const approvePendingInvites = async (email: string) => {
  const snapshot = await get(memberOfRef(email))
  const memberOf = (snapshot.val() || {}) as Record<string, string>
  const pendingOwners = Object.entries(memberOf).filter(([, status]) => status === 'pending').map(([owner]) => owner)
  if (pendingOwners.length === 0) return
  const key = sanitizeEmailKey(email)
  logClientAction(`[lists] approvePendingInvites: user=${email} owners=${pendingOwners.length}`)
  const updates: Record<string, unknown> = {}
  pendingOwners.forEach((ownerKey) => {
    // Only the status sub-field on the owner's side — its value is { email,
    // status }, not a bare enum, since the owner needs the real address to
    // display (see InviteEntry). memberOf stays a bare enum: the current user
    // already knows their own email, so there's nothing to look up there.
    updates[`users/${ownerKey}/invites/${key}/status`] = 'approved'
    updates[`users/${key}/memberOf/${ownerKey}`] = 'approved'
  })
  return update(ref(db), updates)
}

export const inviteToList = async (ownerEmail: string, invitedEmail: string, invitedBy?: string | null) => {
  const normalized = invitedEmail.trim().toLowerCase()
  const ownerKey = sanitizeEmailKey(ownerEmail)
  const invitedKey = sanitizeEmailKey(normalized)
  logClientAction(`[lists] inviteToList: owner=${ownerEmail} invited=${normalized}`)
  await update(ref(db), {
    [`users/${ownerKey}/invites/${invitedKey}`]: { email: normalized, status: 'pending' },
    [`users/${invitedKey}/memberOf/${ownerKey}`]: 'pending'
  })
  const ownerName = await get(userNameRef(ownerEmail))
  return sendInviteEmail(normalized, invitedBy, ownerName.val() || null)
}

export const removeListMember = (ownerEmail: string, invitedEmail: string) => {
  const ownerKey = sanitizeEmailKey(ownerEmail)
  const invitedKey = sanitizeEmailKey(invitedEmail)
  logClientAction(`[lists] removeListMember: owner=${ownerEmail} invited=${invitedEmail}`)
  return update(ref(db), {
    [`users/${ownerKey}/invites/${invitedKey}`]: null,
    [`users/${invitedKey}/memberOf/${ownerKey}`]: null
  })
}

export const renameOwnList = (ownerEmail: string, name: string) => {
  logClientAction(`[lists] renameOwnList: owner=${ownerEmail} name=${name}`)
  return set(userNameRef(ownerEmail), name)
}

// ---------------------------------------------------------------------------
// List-scoped grocery/stock/receipt/category API — every read/write for a
// household's own data goes through this factory, bound to one owner email.
// Consumers get an instance via the useListApi() hook (src/hooks/ListContext.tsx)
// rather than importing these functions directly, so the active list only has to
// be threaded through in one place instead of as a parameter on every call site.
// ---------------------------------------------------------------------------
export function createListApi(ownerEmail: string) {
  const base = `users/${sanitizeEmailKey(ownerEmail)}`
  const groceriesRef = ref(db, `${base}/groceries`)
  const stockRef = ref(db, `${base}/stock`)
  const receiptsRef = ref(db, `${base}/receipts`)
  const categoriesRef = ref(db, `${base}/categories`)

  const touchModified = (key: string, fields: Record<string, unknown>, user?: AuthUser | null) =>
    update(ref(db, `${base}/groceries/${key}`), {
      ...fields,
      modified_at: new Date().toISOString(),
      modified_by: user?.email || null
    })

  const setBought = (key: string, bought: boolean, user?: AuthUser | null) => {
    logClientAction(`[groceries] setBought: list=${ownerEmail} key=${key} bought=${bought} by=${user?.email || 'anonymous'}`)
    return touchModified(key, { bought }, user)
  }

  // Reassign a grocery item to a different category (used by drag-and-drop between
  // category sections and the "move to category" picker in ItemDetailModal). The
  // item's `category` string is its grouping identity — the realtime /groceries
  // listener re-renders it under the new section automatically once this write lands.
  const updateGroceryItemCategory = (key: string, category: string, user?: AuthUser | null) => {
    logClientAction(
      `[groceries] updateGroceryItemCategory: list=${ownerEmail} key=${key} category=${category} by=${user?.email || 'anonymous'}`
    )
    return touchModified(key, { category }, user)
  }

  const saveItemDetails = async (
    key: string,
    { name, note, imageFile }: { name?: string; note?: string | null; imageFile?: File | null },
    user?: AuthUser | null
  ) => {
    const fields: Record<string, unknown> = { note: note ?? null }
    // Same "always write, even if unchanged" pattern this function already used for
    // `note` — an idempotent re-write of an unchanged name is harmless, and this way
    // the caller doesn't need to diff against the original value itself.
    if (name != null) fields.item = name

    if (imageFile) {
      const resized = await resizeImage(imageFile)
      await saveImageDoc('groceryImages', key, resized)
      fields.image_ref = key
    }

    logClientAction(
      `[groceries] saveItemDetails: list=${ownerEmail} key=${key} name=${name != null} note=${note != null} image=${!!imageFile} by=${user?.email || 'anonymous'}`
    )
    return touchModified(key, fields, user)
  }

  const deleteItem = async (key: string, imageRef?: string | null) => {
    logClientAction(`[groceries] deleteItem: list=${ownerEmail} key=${key}`)
    if (imageRef) await deleteImageDoc('groceryImages', imageRef)
    return remove(ref(db, `${base}/groceries/${key}`))
  }

  const touchStock = (key: string, fields: Record<string, unknown>, user?: AuthUser | null) =>
    update(ref(db, `${base}/stock/${key}`), {
      ...fields,
      updated_at: new Date().toISOString(),
      updated_by: user?.email || null
    })

  const addStockItem = (
    item: { name: string; category: string; quantity: number; unit: string; low_threshold: number },
    user?: AuthUser | null
  ) => {
    logClientAction(
      `[stock] addStockItem: list=${ownerEmail} name=${item.name} quantity=${item.quantity} by=${user?.email || 'anonymous'}`
    )
    return push(stockRef, {
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      low_threshold: item.low_threshold,
      updated_at: new Date().toISOString(),
      updated_by: user?.email || null
    })
  }

  const adjustStockQuantity = (key: string, quantity: number, user?: AuthUser | null) => {
    logClientAction(`[stock] adjustStockQuantity: list=${ownerEmail} key=${key} quantity=${quantity} by=${user?.email || 'anonymous'}`)
    return touchStock(key, { quantity: Math.max(0, quantity) }, user)
  }

  const updateStockItem = (key: string, fields: Record<string, unknown>, user?: AuthUser | null) => {
    logClientAction(
      `[stock] updateStockItem: list=${ownerEmail} key=${key} fields=${Object.keys(fields).join(',')} by=${user?.email || 'anonymous'}`
    )
    return touchStock(key, fields, user)
  }

  const deleteStockItem = (key: string) => {
    logClientAction(`[stock] deleteStockItem: list=${ownerEmail} key=${key}`)
    return remove(ref(db, `${base}/stock/${key}`))
  }

  const addStockItemToShoppingList = (entry: { name: string; category: string }, user?: AuthUser | null) => {
    logClientAction(`[groceries] addStockItemToShoppingList: list=${ownerEmail} name=${entry.name} by=${user?.email || 'anonymous'}`)
    return push(groceriesRef, {
      item: entry.name,
      category: entry.category,
      bought: false,
      added_at: new Date().toISOString(),
      raw_text: 'מהמלאי',
      created_by: user?.email || null
    })
  }

  const addGroceryItem = (item: { name: string; category: string }, listName: string | null, user?: AuthUser | null) => {
    logClientAction(
      `[groceries] addGroceryItem: list=${ownerEmail} name=${item.name} sublist=${listName || 'permanent'} by=${user?.email || 'anonymous'}`
    )
    return push(groceriesRef, {
      item: item.name,
      category: item.category,
      bought: false,
      added_at: new Date().toISOString(),
      raw_text: 'נוסף ידנית',
      list_name: listName || null,
      created_by: user?.email || null
    })
  }

  const addPurchasedGroceryItem = (item: { name: string; category: string }, user?: AuthUser | null) => {
    logClientAction(`[groceries] addPurchasedGroceryItem: list=${ownerEmail} name=${item.name} by=${user?.email || 'anonymous'}`)
    const now = new Date().toISOString()
    return push(groceriesRef, {
      item: item.name,
      category: item.category,
      bought: true,
      added_at: now,
      modified_at: now,
      modified_by: user?.email || null,
      raw_text: 'מקבלה',
      created_by: user?.email || null
    })
  }

  // Applies every write from confirming the receipt-reconcile modal in at most two
  // Firebase calls (one multi-path update() per collection touched) instead of one
  // write per line item — a receipt with N items no longer means N separate
  // adjustStockQuantity/setBought/addPurchasedGroceryItem round-trips.
  const applyReceiptReconciliation = (
    ops: {
      stockAdjustments: { key: string; quantity: number }[]
      newStockItems: { name: string; category: string; quantity: number }[]
      groceryBoughtKeys: string[]
      newGroceryItems: { name: string; category: string }[]
    },
    user?: AuthUser | null
  ) => {
    const now = new Date().toISOString()
    const email = user?.email || null
    const writes: Promise<unknown>[] = []

    logClientAction(
      `[receipts] applyReceiptReconciliation: list=${ownerEmail} stockAdjustments=${ops.stockAdjustments.length} newStockItems=${ops.newStockItems.length} groceryBought=${ops.groceryBoughtKeys.length} newGroceryItems=${ops.newGroceryItems.length} by=${email || 'anonymous'}`
    )

    if (ops.stockAdjustments.length > 0 || ops.newStockItems.length > 0) {
      const stockUpdates: Record<string, unknown> = {}
      ops.stockAdjustments.forEach(({ key, quantity }) => {
        stockUpdates[`${key}/quantity`] = Math.max(0, quantity)
        stockUpdates[`${key}/updated_at`] = now
        stockUpdates[`${key}/updated_by`] = email
      })
      // No existing stock item matched this receipt line — create a fresh one instead
      // of silently dropping it. Unit/low_threshold aren't knowable from a receipt line
      // item, so they fall back to the same defaults StockItemModal itself uses.
      ops.newStockItems.forEach((item) => {
        const key = push(stockRef).key as string
        stockUpdates[key] = {
          name: item.name,
          category: item.category,
          quantity: Math.max(0, item.quantity),
          unit: StockUnit.Piece,
          low_threshold: 1,
          updated_at: now,
          updated_by: email
        }
      })
      writes.push(update(stockRef, stockUpdates))
    }

    if (ops.groceryBoughtKeys.length > 0 || ops.newGroceryItems.length > 0) {
      const groceryUpdates: Record<string, unknown> = {}
      ops.groceryBoughtKeys.forEach((key) => {
        groceryUpdates[`${key}/bought`] = true
        groceryUpdates[`${key}/modified_at`] = now
        groceryUpdates[`${key}/modified_by`] = email
      })
      ops.newGroceryItems.forEach((item) => {
        const key = push(groceriesRef).key as string
        groceryUpdates[key] = {
          item: item.name,
          category: item.category,
          bought: true,
          added_at: now,
          modified_at: now,
          modified_by: email,
          raw_text: 'מקבלה',
          created_by: email
        }
      })
      writes.push(update(groceriesRef, groceryUpdates))
    }

    return Promise.all(writes)
  }

  const deleteGroceryList = async (subListName: string | null) => {
    const snapshot = await get(groceriesRef)
    const data = snapshot.val() || {}
    const updates: Record<string, null> = {}
    Object.entries(data).forEach(([key, entry]: [string, any]) => {
      if (entry.list_name === subListName) updates[key] = null
    })
    if (Object.keys(updates).length === 0) return
    logClientAction(
      `[groceries] deleteGroceryList: list=${ownerEmail} sublist=${subListName || 'permanent'} items=${Object.keys(updates).length}`
    )
    return update(groceriesRef, updates)
  }

  const findStockItemByName = async (name: string): Promise<StockItem | null> => {
    const target = normalizeName(name)
    if (!target) return null
    const snapshot = await get(stockRef)
    const data = snapshot.val() || {}
    const match = Object.entries(data).find(([, entry]: [string, any]) => normalizeName(entry.name) === target)
    return match ? ({ key: match[0], ...(match[1] as object) } as StockItem) : null
  }

  const findUnboughtGroceryItemByName = async (name: string): Promise<GroceryItem | null> => {
    const target = normalizeName(name)
    if (!target) return null
    const snapshot = await get(groceriesRef)
    const data = snapshot.val() || {}
    const match = Object.entries(data).find(
      ([, entry]: [string, any]) => normalizeName(entry.item) === target && !entry.bought
    )
    return match ? ({ key: match[0], ...(match[1] as object) } as GroceryItem) : null
  }

  // Batch variants for matching many names at once (e.g. every line item on a receipt) —
  // a single get() each instead of one Firebase read per item.
  const getAllStockItems = async (): Promise<StockItem[]> => {
    const snapshot = await get(stockRef)
    const data = snapshot.val() || {}
    return Object.entries(data as Record<string, any>).map(([key, entry]) => ({ key, ...entry }))
  }

  const getAllGroceryItems = async (): Promise<GroceryItem[]> => {
    const snapshot = await get(groceriesRef)
    const data = snapshot.val() || {}
    return Object.entries(data as Record<string, any>).map(([key, entry]) => ({ key, ...entry }))
  }

  const saveReceipt = async (
    receipt: { source_url?: string | null; store_name?: string | null; items: ReceiptItem[]; total: number | null },
    imageBlob: Blob | null,
    user?: AuthUser | null
  ) => {
    const newRef = push(receiptsRef)
    const key = newRef.key as string
    let image_ref: string | null = null
    let imageSkipped = false

    if (imageBlob) {
      try {
        await saveImageDoc('receiptImages', key, imageBlob)
        image_ref = key
      } catch (err) {
        if (!(err instanceof ImageTooLargeError)) throw err
        imageSkipped = true
      }
    }

    await set(newRef, {
      image_url: null,
      image_ref,
      // Only persist http(s) links — a javascript:/data: source_url would render as a
      // script-executing link later (see isSafeHttpUrl). Reject at the write boundary so
      // bad data never lands in Firebase.
      source_url: isSafeHttpUrl(receipt.source_url) ? receipt.source_url : null,
      store_name: receipt.store_name || null,
      items: receipt.items,
      total: receipt.total,
      scanned_at: new Date().toISOString(),
      scanned_by: user?.email || null
    })

    logClientAction(
      `[receipts] saveReceipt: list=${ownerEmail} key=${key} store=${receipt.store_name || 'unknown'} items=${receipt.items.length} by=${user?.email || 'anonymous'}`
    )
    return { key, imageSkipped }
  }

  const deleteReceipt = async (key: string, imageRef?: string | null) => {
    logClientAction(`[receipts] deleteReceipt: list=${ownerEmail} key=${key}`)
    if (imageRef) await deleteImageDoc('receiptImages', imageRef)
    return remove(ref(db, `${base}/receipts/${key}`))
  }

  const getReceiptPriceHistory = async (itemName: string) => {
    const target = normalizeName(itemName)
    const snapshot = await get(receiptsRef)
    const data = snapshot.val() || {}

    return Object.values(data as Record<string, any>)
      .flatMap((receipt: any) =>
        (receipt.items || [])
          .filter((item: any) => normalizeName(item.name) === target)
          .map((item: any) => ({ price: item.price, date: receipt.scanned_at }))
      )
      .sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''))
  }

  // Defensive one-time seed: only writes if this list's /categories is currently
  // empty, so this never clobbers real edits made after the first run. Every new
  // list starts from the same DEFAULT_CATEGORIES a fresh household would expect.
  const seedCategoriesIfEmpty = async () => {
    const snapshot = await get(categoriesRef)
    if (snapshot.exists()) return
    logClientAction(`[categories] seedCategoriesIfEmpty: list=${ownerEmail} seeding default categories`)
    await set(categoriesRef, DEFAULT_CATEGORIES)
  }

  const addCategory = (category: { name: string; color: string; icon?: string; order?: number }) => {
    logClientAction(`[categories] addCategory: list=${ownerEmail} name=${category.name}`)
    return push(categoriesRef, {
      name: category.name,
      color: category.color,
      icon: category.icon || '📌',
      protected: false,
      order: typeof category.order === 'number' ? category.order : 0
    })
  }

  const updateCategory = (key: string, fields: Record<string, unknown>) => {
    logClientAction(`[categories] updateCategory: list=${ownerEmail} key=${key} fields=${Object.keys(fields).join(',')}`)
    return update(ref(db, `${base}/categories/${key}`), fields)
  }

  const deleteCategory = (key: string) => {
    logClientAction(`[categories] deleteCategory: list=${ownerEmail} key=${key}`)
    return remove(ref(db, `${base}/categories/${key}`))
  }

  return {
    ownerEmail,
    groceriesRef,
    stockRef,
    receiptsRef,
    categoriesRef,
    setBought,
    updateGroceryItemCategory,
    saveItemDetails,
    deleteItem,
    addStockItem,
    adjustStockQuantity,
    updateStockItem,
    deleteStockItem,
    addStockItemToShoppingList,
    addGroceryItem,
    addPurchasedGroceryItem,
    applyReceiptReconciliation,
    deleteGroceryList,
    findStockItemByName,
    findUnboughtGroceryItemByName,
    getAllStockItems,
    getAllGroceryItems,
    saveReceipt,
    deleteReceipt,
    getReceiptPriceHistory,
    seedCategoriesIfEmpty,
    addCategory,
    updateCategory,
    deleteCategory
  }
}

export type ListApi = ReturnType<typeof createListApi>

export { OTHER_CATEGORY_NAME }

// Same-origin path, not the n8n URL directly — /api/scan-receipt (a TanStack Start
// server route) keeps the webhook URL server-side only, out of the browser's JS bundle.
export const scanReceipt = async (fileBlob: Blob & { type: string }) => {
  const base64 = await blobToBase64(fileBlob)
  const response = await fetch('/api/scan-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify({ image_base64: base64, mime_type: fileBlob.type || 'image/jpeg' })
  })
  if (!response.ok) throw new Error('סריקת הקבלה נכשלה (' + response.status + ')')
  return response.json()
}

// Same-origin path — /api/scan-receipt-url (TanStack Start server route) fetches the
// given link server-side and extracts a receipt from it, so neither the n8n URL nor
// any scraping logic ever reaches the browser.
export const scanReceiptFromUrl = async (sourceUrl: string) => {
  const response = await fetch('/api/scan-receipt-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify({ url: sourceUrl })
  })
  if (!response.ok) throw new Error('קריאת הקבלה מהקישור נכשלה (' + response.status + ')')
  return response.json()
}

// Best-effort — the invite itself is the addListMember write, which has already
// succeeded by the time this is called. A missing SMTP config (expected until it's
// provisioned) or a delivery failure must never look like the invite itself failed,
// so this never throws — callers can inspect the resolved value if they want to
// surface a soft "email didn't send" notice, but nothing depends on it.
export const sendInviteEmail = async (
  email: string,
  invitedBy?: string | null,
  listName?: string | null
): Promise<{ error: boolean }> => {
  try {
    const response = await fetch('/api/send-invite-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: email.trim().toLowerCase(), invitedBy, listName })
    })
    const data = await response.json()
    if (data.error) logClientAction(`[lists] sendInviteEmail: failed message=${data.message}`)
    return data
  } catch (err: any) {
    logClientAction(`[lists] sendInviteEmail: network error message=${err.message}`)
    return { error: true }
  }
}

// Sends a user's free-text feedback/feature request to n8n (via the same-origin
// /api/submit-feedback proxy, which hides the webhook URL) where Gemini structures it
// into a ticket and a Trello card is created. Auto-populates the metadata the ticket
// needs — the caller only supplies the request text and the current route. Returns
// { error } rather than throwing so the modal can show a recoverable message; the
// request itself is never silently dropped on the client side.
export interface FeedbackSubmission {
  request: string
  route?: string
  user?: AuthUser | null
  language?: string
}

export const submitFeedback = async ({
  request,
  route,
  user,
  language
}: FeedbackSubmission): Promise<{ error: boolean; message?: string }> => {
  const payload = {
    request,
    name: user?.displayName || user?.email || 'Anonymous',
    email: user?.email || null,
    submittedAt: new Date().toISOString(),
    language: language || 'he',
    source: 'fridge-list-app',
    route: route || null,
    appVersion: APP_VERSION
  }
  logClientAction(`[feedback] submitFeedback: from=${payload.name} lang=${payload.language} route=${payload.route}`)
  try {
    const response = await fetch('/api/submit-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
      body: JSON.stringify(payload)
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.error) {
      logClientAction(`[feedback] submitFeedback failed: status=${response.status} message=${data.message || 'unknown'}`)
      return { error: true, message: data.message }
    }
    return { error: false }
  } catch (err: any) {
    logClientAction(`[feedback] submitFeedback network error: ${err.message}`)
    return { error: true, message: err.message }
  }
}

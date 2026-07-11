import { initializeApp } from 'firebase/app'
import { getDatabase, ref, onValue, get, push, set, update, remove } from 'firebase/database'
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { getFirestore, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore'
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_NAME } from './categories'
import { logger } from './logger'
import { normalizeName } from './normalizeName'
import { StockUnit } from './units'
import type { AuthUser, GroceryItem, ReceiptItem, StockItem } from '../types'
import { version as APP_VERSION } from '../../package.json'

// Logs client-side actions (grocery/stock/receipt/category/admin writes) to the
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

export const ADMIN_EMAILS: string[] = ['muli.turiel@gmail.com']

export const groceriesRef = ref(db, 'groceries')
export { onValue }

export const signIn = () => signInWithPopup(auth, googleProvider)
export const signOutUser = () => signOut(auth)
export const onAuthChange = (cb: (user: User | null) => void) => onAuthStateChanged(auth, cb)

const touchModified = (key: string, fields: Record<string, unknown>, user?: AuthUser | null) =>
  update(ref(db, `groceries/${key}`), {
    ...fields,
    modified_at: new Date().toISOString(),
    modified_by: user?.email || null
  })

export const setBought = (key: string, bought: boolean, user?: AuthUser | null) => {
  logClientAction(`[groceries] setBought: key=${key} bought=${bought} by=${user?.email || 'anonymous'}`)
  return touchModified(key, { bought }, user)
}

// Reassign a grocery item to a different category (used by drag-and-drop between
// category sections and the "move to category" picker in ItemDetailModal). The
// item's `category` string is its grouping identity — the realtime /groceries
// listener re-renders it under the new section automatically once this write lands.
export const updateGroceryItemCategory = (key: string, category: string, user?: AuthUser | null) => {
  logClientAction(`[groceries] updateGroceryItemCategory: key=${key} category=${category} by=${user?.email || 'anonymous'}`)
  return touchModified(key, { category }, user)
}

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

export const saveItemDetails = async (
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
    `[groceries] saveItemDetails: key=${key} name=${name != null} note=${note != null} image=${!!imageFile} by=${user?.email || 'anonymous'}`
  )
  return touchModified(key, fields, user)
}

export const deleteItem = async (key: string, imageRef?: string | null) => {
  logClientAction(`[groceries] deleteItem: key=${key}`)
  if (imageRef) await deleteImageDoc('groceryImages', imageRef)
  return remove(ref(db, `groceries/${key}`))
}

export const stockRef = ref(db, 'stock')

const touchStock = (key: string, fields: Record<string, unknown>, user?: AuthUser | null) =>
  update(ref(db, `stock/${key}`), {
    ...fields,
    updated_at: new Date().toISOString(),
    updated_by: user?.email || null
  })

export const addStockItem = (
  item: { name: string; category: string; quantity: number; unit: string; low_threshold: number },
  user?: AuthUser | null
) => {
  logClientAction(`[stock] addStockItem: name=${item.name} quantity=${item.quantity} by=${user?.email || 'anonymous'}`)
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

export const adjustStockQuantity = (key: string, quantity: number, user?: AuthUser | null) => {
  logClientAction(`[stock] adjustStockQuantity: key=${key} quantity=${quantity} by=${user?.email || 'anonymous'}`)
  return touchStock(key, { quantity: Math.max(0, quantity) }, user)
}

export const updateStockItem = (key: string, fields: Record<string, unknown>, user?: AuthUser | null) => {
  logClientAction(`[stock] updateStockItem: key=${key} fields=${Object.keys(fields).join(',')} by=${user?.email || 'anonymous'}`)
  return touchStock(key, fields, user)
}

export const deleteStockItem = (key: string) => {
  logClientAction(`[stock] deleteStockItem: key=${key}`)
  return remove(ref(db, `stock/${key}`))
}

export const addStockItemToShoppingList = (entry: { name: string; category: string }, user?: AuthUser | null) => {
  logClientAction(`[groceries] addStockItemToShoppingList: name=${entry.name} by=${user?.email || 'anonymous'}`)
  return push(groceriesRef, {
    item: entry.name,
    category: entry.category,
    bought: false,
    added_at: new Date().toISOString(),
    raw_text: 'מהמלאי',
    created_by: user?.email || null
  })
}

export const addGroceryItem = (
  item: { name: string; category: string },
  listName: string | null,
  user?: AuthUser | null
) => {
  logClientAction(`[groceries] addGroceryItem: name=${item.name} list=${listName || 'permanent'} by=${user?.email || 'anonymous'}`)
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

// Same-origin path, not the n8n URL directly — /api/categorize-item (a TanStack Start
// server route) keeps the webhook URL server-side only. Mirrors Siri's own
// extract-and-categorize Gemini prompt/category list, so manually typed items get the
// same categorization as voice-added ones. Free text can contain more than one item
// (e.g. "חלב ולחם"); returns [] if nothing relevant to a shopping list was found.
export const categorizeItem = async (text: string): Promise<{ item: string; category: string }[]> => {
  const response = await fetch('/api/categorize-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  })
  if (!response.ok) throw new Error('סיווג הפריט נכשל (' + response.status + ')')
  const data = await response.json()
  return data.items || []
}

export const addPurchasedGroceryItem = (item: { name: string; category: string }, user?: AuthUser | null) => {
  logClientAction(`[groceries] addPurchasedGroceryItem: name=${item.name} by=${user?.email || 'anonymous'}`)
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
export const applyReceiptReconciliation = (
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
    `[receipts] applyReceiptReconciliation: stockAdjustments=${ops.stockAdjustments.length} newStockItems=${ops.newStockItems.length} groceryBought=${ops.groceryBoughtKeys.length} newGroceryItems=${ops.newGroceryItems.length} by=${email || 'anonymous'}`
  )

  if (ops.stockAdjustments.length > 0 || ops.newStockItems.length > 0) {
    const stockUpdates: Record<string, unknown> = {}
    ops.stockAdjustments.forEach(({ key, quantity }) => {
      stockUpdates[`${key}/quantity`] = Math.max(0, quantity)
      stockUpdates[`${key}/updated_at`] = now
      stockUpdates[`${key}/updated_by`] = email
    })
    // No existing stock item matched this receipt line — create a fresh one instead
    // of silently dropping it, which is what used to happen (a product never
    // tracked in stock before could never end up in stock via a receipt scan, no
    // matter what the user selected, since there was no code path that created one).
    // Unit/low_threshold aren't knowable from a receipt line item, so they fall back
    // to the same defaults StockItemModal itself uses for a brand-new item.
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

export const deleteGroceryList = async (listName: string | null) => {
  const snapshot = await get(groceriesRef)
  const data = snapshot.val() || {}
  const updates: Record<string, null> = {}
  Object.entries(data).forEach(([key, entry]: [string, any]) => {
    if (entry.list_name === listName) updates[key] = null
  })
  if (Object.keys(updates).length === 0) return
  logClientAction(`[groceries] deleteGroceryList: list=${listName || 'permanent'} items=${Object.keys(updates).length}`)
  return update(groceriesRef, updates)
}

export const findStockItemByName = async (name: string): Promise<StockItem | null> => {
  const target = normalizeName(name)
  if (!target) return null
  const snapshot = await get(stockRef)
  const data = snapshot.val() || {}
  const match = Object.entries(data).find(([, entry]: [string, any]) => normalizeName(entry.name) === target)
  return match ? ({ key: match[0], ...(match[1] as object) } as StockItem) : null
}

export const findUnboughtGroceryItemByName = async (name: string): Promise<GroceryItem | null> => {
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
export const getAllStockItems = async (): Promise<StockItem[]> => {
  const snapshot = await get(stockRef)
  const data = snapshot.val() || {}
  return Object.entries(data as Record<string, any>).map(([key, entry]) => ({ key, ...entry }))
}

export const getAllGroceryItems = async (): Promise<GroceryItem[]> => {
  const snapshot = await get(groceriesRef)
  const data = snapshot.val() || {}
  return Object.entries(data as Record<string, any>).map(([key, entry]) => ({ key, ...entry }))
}

export const receiptsRef = ref(db, 'receipts')

// Same-origin path, not the n8n URL directly — /api/scan-receipt (a TanStack Start
// server route) keeps the webhook URL server-side only, out of the browser's JS bundle.
export const scanReceipt = async (fileBlob: Blob & { type: string }) => {
  const base64 = await blobToBase64(fileBlob)
  const response = await fetch('/api/scan-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: sourceUrl })
  })
  if (!response.ok) throw new Error('קריאת הקבלה מהקישור נכשלה (' + response.status + ')')
  return response.json()
}

export const saveReceipt = async (
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
    source_url: receipt.source_url || null,
    store_name: receipt.store_name || null,
    items: receipt.items,
    total: receipt.total,
    scanned_at: new Date().toISOString(),
    scanned_by: user?.email || null
  })

  logClientAction(
    `[receipts] saveReceipt: key=${key} store=${receipt.store_name || 'unknown'} items=${receipt.items.length} by=${user?.email || 'anonymous'}`
  )
  return { key, imageSkipped }
}

export const deleteReceipt = async (key: string, imageRef?: string | null) => {
  logClientAction(`[receipts] deleteReceipt: key=${key}`)
  if (imageRef) await deleteImageDoc('receiptImages', imageRef)
  return remove(ref(db, `receipts/${key}`))
}

export const getReceiptPriceHistory = async (itemName: string) => {
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

export const categoriesRef = ref(db, 'categories')

// Defensive one-time seed: only writes if /categories is currently empty, so this
// never clobbers real edits made after the first run.
export const seedCategoriesIfEmpty = async () => {
  const snapshot = await get(categoriesRef)
  if (snapshot.exists()) return
  logClientAction('[categories] seedCategoriesIfEmpty: seeding default categories')
  await set(categoriesRef, DEFAULT_CATEGORIES)
}

export const addCategory = (category: { name: string; color: string; icon?: string; order?: number }) => {
  logClientAction(`[categories] addCategory: name=${category.name}`)
  return push(categoriesRef, {
    name: category.name,
    color: category.color,
    icon: category.icon || '📌',
    protected: false,
    order: typeof category.order === 'number' ? category.order : 0
  })
}

export const updateCategory = (key: string, fields: Record<string, unknown>) => {
  logClientAction(`[categories] updateCategory: key=${key} fields=${Object.keys(fields).join(',')}`)
  return update(ref(db, `categories/${key}`), fields)
}

export const deleteCategory = (key: string) => {
  logClientAction(`[categories] deleteCategory: key=${key}`)
  return remove(ref(db, `categories/${key}`))
}

export { OTHER_CATEGORY_NAME }

export const adminsRef = ref(db, 'admins')

export const addAdminEmail = (email: string) => {
  const normalized = email.trim().toLowerCase()
  logClientAction(`[admins] addAdminEmail: email=${normalized}`)
  const key = normalized.replace(/[.#$[\]]/g, '_')
  return set(ref(db, `admins/${key}`), normalized)
}

export const removeAdminEmail = (email: string) => {
  const normalized = email.trim().toLowerCase()
  logClientAction(`[admins] removeAdminEmail: email=${normalized}`)
  const key = normalized.replace(/[.#$[\]]/g, '_')
  return remove(ref(db, `admins/${key}`))
}

// Best-effort — the invite itself is the `addAdminEmail` write above, which has
// already succeeded by the time this is called. A missing SMTP config (expected
// until it's provisioned) or a delivery failure must never look like the invite
// itself failed, so this never throws — callers can inspect the resolved value if
// they want to surface a soft "email didn't send" notice, but nothing depends on it.
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
      headers: { 'Content-Type': 'application/json' },
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

export const sendInviteEmail = async (email: string, invitedBy?: string | null): Promise<{ error: boolean }> => {
  try {
    const response = await fetch('/api/send-invite-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: email.trim().toLowerCase(), invitedBy })
    })
    const data = await response.json()
    if (data.error) logClientAction(`[admins] sendInviteEmail: failed message=${data.message}`)
    return data
  } catch (err: any) {
    logClientAction(`[admins] sendInviteEmail: network error message=${err.message}`)
    return { error: true }
  }
}

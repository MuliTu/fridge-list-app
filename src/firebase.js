import { initializeApp } from 'firebase/app'
import { getDatabase, ref, onValue, get, push, set, update, remove } from 'firebase/database'
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth'
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_NAME } from './categories.js'

const firebaseConfig = {
  apiKey: 'AIzaSyAcwoGM2xPNBF372qI9kqVsp72kUG-Errs',
  authDomain: 'n8n-vocal-2-db.firebaseapp.com',
  databaseURL: 'https://n8n-vocal-2-db-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'n8n-vocal-2-db',
  // Confirm this matches the bucket name shown once Storage is enabled in the console
  // (older projects use <project-id>.appspot.com, newer ones <project-id>.firebasestorage.app).
  storageBucket: 'n8n-vocal-2-db.appspot.com',
  appId: '1:32784605229:web:0375ee6a30d8bb5da5d8a4'
}

const app = initializeApp(firebaseConfig)
const db = getDatabase(app)
const auth = getAuth(app)
const storage = getStorage(app)
const googleProvider = new GoogleAuthProvider()

export const ADMIN_EMAILS = ['muli.turiel@gmail.com']

export const groceriesRef = ref(db, 'groceries')
export { onValue }

export const signIn = () => signInWithPopup(auth, googleProvider)
export const signOutUser = () => signOut(auth)
export const onAuthChange = (cb) => onAuthStateChanged(auth, cb)

const touchModified = (key, fields, user) =>
  update(ref(db, `groceries/${key}`), {
    ...fields,
    modified_at: new Date().toISOString(),
    modified_by: user?.email || null
  })

export const setBought = (key, bought, user) => touchModified(key, { bought }, user)

export const resizeImage = (file, maxDim = 1280, quality = 0.75) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('image encode failed'))), 'image/jpeg', quality)
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => reject(new Error('image load failed'))
    img.src = URL.createObjectURL(file)
  })

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error('image read failed'))
    reader.readAsDataURL(blob)
  })

export const saveItemDetails = async (key, { note, imageFile }, user) => {
  const fields = { note: note ?? null }

  if (imageFile) {
    const resized = await resizeImage(imageFile)
    const path = storageRef(storage, `groceries/${key}/${Date.now()}.jpg`)
    await uploadBytes(path, resized, { contentType: 'image/jpeg' })
    fields.image_url = await getDownloadURL(path)
  }

  return touchModified(key, fields, user)
}

export const deleteItem = async (key, imageUrl) => {
  if (imageUrl) {
    try {
      await deleteObject(storageRef(storage, imageUrl))
    } catch {
      // best-effort cleanup; still remove the list entry even if the image is already gone
    }
  }
  return remove(ref(db, `groceries/${key}`))
}

export const stockRef = ref(db, 'stock')

const touchStock = (key, fields, user) =>
  update(ref(db, `stock/${key}`), {
    ...fields,
    updated_at: new Date().toISOString(),
    updated_by: user?.email || null
  })

export const addStockItem = (item, user) =>
  push(stockRef, {
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    low_threshold: item.low_threshold,
    updated_at: new Date().toISOString(),
    updated_by: user?.email || null
  })

export const adjustStockQuantity = (key, quantity, user) =>
  touchStock(key, { quantity: Math.max(0, quantity) }, user)

export const updateStockItem = (key, fields, user) => touchStock(key, fields, user)

export const deleteStockItem = (key) => remove(ref(db, `stock/${key}`))

export const addStockItemToShoppingList = (entry, user) =>
  push(groceriesRef, {
    item: entry.name,
    category: entry.category,
    bought: false,
    added_at: new Date().toISOString(),
    raw_text: 'מהמלאי',
    created_by: user?.email || null
  })

export const addGroceryItem = (item, listName, user) =>
  push(groceriesRef, {
    item: item.name,
    category: item.category,
    bought: false,
    added_at: new Date().toISOString(),
    raw_text: 'נוסף ידנית',
    list_name: listName || null,
    created_by: user?.email || null
  })

export const deleteGroceryList = async (listName) => {
  const snapshot = await get(groceriesRef)
  const data = snapshot.val() || {}
  const updates = {}
  Object.entries(data).forEach(([key, entry]) => {
    if (entry.list_name === listName) updates[key] = null
  })
  if (Object.keys(updates).length === 0) return
  return update(groceriesRef, updates)
}

const normalizeName = (name) => (name || '').trim().toLowerCase()

export const findStockItemByName = async (name) => {
  const target = normalizeName(name)
  if (!target) return null
  const snapshot = await get(stockRef)
  const data = snapshot.val() || {}
  const match = Object.entries(data).find(([, entry]) => normalizeName(entry.name) === target)
  return match ? { key: match[0], ...match[1] } : null
}

export const receiptsRef = ref(db, 'receipts')

const RECEIPT_SCAN_URL = 'https://whiny-idealist-unseen.ngrok-free.dev/webhook/receipt-scan'

export const scanReceipt = async (imageBlob) => {
  const base64 = await blobToBase64(imageBlob)
  const response = await fetch(RECEIPT_SCAN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: base64 })
  })
  if (!response.ok) throw new Error('סריקת הקבלה נכשלה (' + response.status + ')')
  return response.json()
}

export const saveReceipt = async (receipt, imageBlob, user) => {
  const path = storageRef(storage, `receipts/${Date.now()}.jpg`)
  await uploadBytes(path, imageBlob, { contentType: 'image/jpeg' })
  const image_url = await getDownloadURL(path)

  return push(receiptsRef, {
    image_url,
    store_name: receipt.store_name || null,
    items: receipt.items,
    total: receipt.total,
    scanned_at: new Date().toISOString(),
    scanned_by: user?.email || null
  })
}

export const deleteReceipt = async (key, imageUrl) => {
  if (imageUrl) {
    try {
      await deleteObject(storageRef(storage, imageUrl))
    } catch {
      // best-effort cleanup; still remove the receipt entry even if the image is already gone
    }
  }
  return remove(ref(db, `receipts/${key}`))
}

export const getReceiptPriceHistory = async (itemName) => {
  const target = normalizeName(itemName)
  const snapshot = await get(receiptsRef)
  const data = snapshot.val() || {}

  return Object.values(data)
    .flatMap((receipt) =>
      (receipt.items || [])
        .filter((item) => normalizeName(item.name) === target)
        .map((item) => ({ price: item.price, date: receipt.scanned_at }))
    )
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
}

export const categoriesRef = ref(db, 'categories')

// Defensive one-time seed: only writes if /categories is currently empty, so this
// never clobbers real edits made after the first run.
export const seedCategoriesIfEmpty = async () => {
  const snapshot = await get(categoriesRef)
  if (snapshot.exists()) return
  await set(categoriesRef, DEFAULT_CATEGORIES)
}

export const addCategory = (category) =>
  push(categoriesRef, {
    name: category.name,
    color: category.color,
    icon: category.icon || '📌',
    protected: false
  })

export const updateCategory = (key, fields) => update(ref(db, `categories/${key}`), fields)

export const deleteCategory = (key) => remove(ref(db, `categories/${key}`))

export { OTHER_CATEGORY_NAME }

export const adminsRef = ref(db, 'admins')

export const addAdminEmail = (email) => {
  const key = email.trim().toLowerCase().replace(/[.#$[\]]/g, '_')
  return set(ref(db, `admins/${key}`), email.trim().toLowerCase())
}

export const removeAdminEmail = (email) => {
  const key = email.trim().toLowerCase().replace(/[.#$[\]]/g, '_')
  return remove(ref(db, `admins/${key}`))
}

export interface AuthUser {
  email: string | null
  displayName?: string | null
}

// A household: identified by its owner's email, not a generated ID — every user
// gets exactly one list, auto-provisioned at /users/{sanitizedEmail} on first
// sign-in. `id` and `owner` are the same email; kept as separate fields so call
// sites read naturally (`activeList.id` as the scoping key, `activeList.owner` for
// ownership checks) without every consumer needing to know they're identical here.
// `status` is only meaningful for a list the current user doesn't own — see
// ListContext's memberOf discovery.
export interface UserList {
  id: string
  name: string
  owner: string
  status: 'owner' | 'pending' | 'approved'
}

export interface GroceryItem {
  key: string
  item: string
  category: string
  bought: boolean
  added_at: string
  raw_text?: string
  note?: string | null
  image_url?: string | null
  image_ref?: string | null
  modified_at?: string
  modified_by?: string | null
  list_name?: string | null
  created_by?: string | null
  isFresh?: boolean
  quantity?: number | null
  unit?: string | null
}

export interface Category {
  key: string
  name: string
  color: string
  icon: string
  protected: boolean
  order?: number
}

// Global, not per-list — lives at the RTDB root (`/whats_new`), same tier as `/users`,
// since it's app-wide release info rather than household data. Single object (not a
// history), so a new version simply overwrites the previous one.
export interface WhatsNew {
  version: string
  updates: string[]
}

// Append-only purchase-event log — one record per manual/voice "bought" checkbox
// transition to true (never on uncheck, never mutated/deleted after write). Lives at
// /users/{sanitizeEmailKey(ownerEmail)}/purchaseHistory/{pushId} — per-owner, like
// groceries/stock/receipts/categories, since this app is fully multi-tenant. Source is
// deliberately the bought checkbox only, not receipts (receipts already have their own
// separate price-history feature) — see recordPurchaseEvent in src/lib/firebase.ts.
// Purely a write path for now; a future ticket (consumption insights / AI habit
// summary) reads from this — no aggregation/UI is built against it yet.
export interface PurchaseEvent {
  itemName: string
  category: string
  quantity: number | null
  unit: string | null
  purchasedAt: string
  purchasedBy: string | null
}

export interface StockItem {
  key: string
  name: string
  category: string
  quantity: number
  unit: string
  low_threshold: number
  updated_at: string
  updated_by?: string | null
}

export interface ReceiptItem {
  name: string
  price: number
  quantity: number
}

export interface Receipt {
  key: string
  image_url: string | null
  image_ref?: string | null
  source_url?: string | null
  store_name: string | null
  items: ReceiptItem[]
  total: number | null
  scanned_at: string
  scanned_by?: string | null
}

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

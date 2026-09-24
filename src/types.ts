export type AuthUser = {
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
export type UserList = {
  id: string
  name: string
  owner: string
  status: 'owner' | 'pending' | 'approved'
}

export type GroceryItem = {
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

export type Category = {
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
export type WhatsNew = {
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
export type PurchaseEvent = {
  itemName: string
  category: string
  quantity: number | null
  unit: string | null
  purchasedAt: string
  purchasedBy: string | null
}

export type StockItem = {
  key: string
  name: string
  category: string
  quantity: number
  unit: string
  low_threshold: number
  updated_at: string
  updated_by?: string | null
}

export type ReceiptItem = {
  name: string
  price: number
  quantity: number
}

export type Receipt = {
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

// Global, not per-list — lives at the RTDB root (`/feedbacks`), same tier as `/users`/
// `/whats_new`, since feedback isn't owned by any particular household list. This is a
// durability/observability layer over the existing submit -> n8n -> ticket flow. It
// records every submission attempt and its outcome, but never changes what that flow
// itself does.
// 'needs_attention' (ticket F3) is a terminal status distinct from 'error': it means a
// human needs to look at this record directly (either its retries are exhausted, or a
// previous retry attempt's outcome is genuinely unknown — see `attemptId` below) rather
// than "the hourly job will keep trying." Once a record is in this status it is never
// picked up by the retry job again (see ELIGIBLE_STATUSES in retryFeedback.ts) — it's
// reported once, via the maintainer-notification path, at the moment it transitions
// here, not re-reported on every subsequent run.
export type FeedbackRecord = {
  createdAt: string
  updatedAt: string
  userId: string
  username: string
  message: string
  status: 'new' | 'processing' | 'ticket_created' | 'error' | 'needs_attention'
  error: null | { message: string; detail?: string }
  retryCount: number
  lastAttemptAt: string | null
  ticket: null | { id: string; url: string; title: string }
  // Idempotency guard (ticket F3). Stamped with a fresh, unique value by the retry
  // job's `claimForProcessing` at the same moment it flips status to 'processing' (one
  // atomic transaction — see retryFeedback.ts), and always cleared back to `null` by
  // whichever call durably records the attempt's outcome (`markTicketCreated`,
  // `markError`, or `markNeedsAttention`). A record found with a non-null `attemptId` on
  // a later read means a previous attempt's outcome was never durably written back
  // (e.g. the process crashed mid-write after the n8n/Trello call already succeeded) —
  // that's genuinely ambiguous (a duplicate Trello card is possible), so it is never
  // auto-retried; it's routed straight to 'needs_attention' instead. Absent on records
  // created before this ticket; treat `undefined` the same as `null` wherever read.
  attemptId?: string | null
}

// Shared dedup/matching normalization used across groceries, stock, and receipts
// (firebase.ts's findStockItemByName/findUnboughtGroceryItemByName/getReceiptPriceHistory,
// receipts.tsx's price history + reconciliation matching). Exact-string-match only
// (case-insensitive, trimmed) — "עגבניות" vs "עגבניה" is a known, accepted gap, not
// something to silently fix here.
export const normalizeName = (name?: string | null) => (name || '').trim().toLowerCase()

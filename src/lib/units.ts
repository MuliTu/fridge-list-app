// Stock unit values. These are persisted as-is in Firebase (`/stock/{pushId}.unit`),
// so the string values must never change/translate — same rule as OTHER_CATEGORY_NAME
// in categories.ts (see CLAUDE.md "Persisted data values are never translated").
export enum StockUnit {
  Piece = 'יח\'',
  Kilogram = 'ק"ג',
  Gram = 'גרם',
  Liter = 'ליטר',
  Milliliter = 'מ"ל',
  Package = 'חבילה'
}

// Preset options shown in the unit picker, in display order.
export const UNIT_PRESETS: StockUnit[] = [
  StockUnit.Piece,
  StockUnit.Kilogram,
  StockUnit.Gram,
  StockUnit.Liter,
  StockUnit.Milliliter,
  StockUnit.Package
]

// Sentinel value for the picker's "custom unit" option — not itself a persisted unit,
// just a UI marker meaning "use the free-text field below instead".
export const OTHER_UNIT = 'אחר'

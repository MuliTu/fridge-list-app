// Stock unit values. These are persisted as-is in Firebase (`/stock/{pushId}.unit` and,
// since the same picker is reused for shopping-list item quantities, also
// `/groceries/{pushId}.unit`), so the string values must never change/translate — same
// rule as OTHER_CATEGORY_NAME in categories.ts (see CLAUDE.md "Persisted data values
// are never translated").
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

// Sentinel for the "no unit selected" option — only meaningful where a unit is
// optional (shopping-list items may carry a bare quantity with no unit at all, unlike
// /stock where a unit is always required). Radix Select forbids an empty-string item
// value, hence a distinct marker rather than ''.
export const NO_UNIT = '__no_unit__'

export interface QuantityUnitFields {
  quantityText: string
  unit: string
  customUnit: string
}

export interface QuantityUnitResolution {
  quantity: number | null
  unit: string | null
  error: 'invalidQuantity' | 'unitRequiresQuantity' | null
}

// Shared validation for the optional quantity/unit fields on shopping-list items,
// used by both GroceryItemModal (add) and ItemDetailModal (edit) so the two flows
// can't drift apart. Rules straight from the ticket: quantity is optional but must be
// a positive number if given; a unit may only be set alongside a quantity (an empty
// item name field is out of scope here — callers validate that separately).
export function resolveQuantityUnit({ quantityText, unit, customUnit }: QuantityUnitFields): QuantityUnitResolution {
  const trimmedQuantity = quantityText.trim()
  let quantity: number | null = null
  if (trimmedQuantity) {
    const parsed = Number(trimmedQuantity)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { quantity: null, unit: null, error: 'invalidQuantity' }
    }
    quantity = parsed
  }

  const effectiveUnit = unit === NO_UNIT ? null : unit === OTHER_UNIT ? customUnit.trim() || null : unit

  if (effectiveUnit && quantity == null) {
    return { quantity: null, unit: null, error: 'unitRequiresQuantity' }
  }

  return { quantity, unit: effectiveUnit, error: null }
}

// Free-text unit aliases accepted when parsing pasted/typed text (BulkUploadModal) —
// people write "kilo"/"kg"/"ליטר"/"liters" etc rather than picking from the dropdown.
// Keys are matched case-insensitively; Hebrew presets are matched as exact literals
// alongside their common shorthand. Not used anywhere quantity/unit is entered via the
// picker UI itself (GroceryItemModal/ItemDetailModal) — only for parsing raw text.
const UNIT_ALIASES: Record<string, StockUnit> = {
  kilo: StockUnit.Kilogram,
  kilos: StockUnit.Kilogram,
  kilogram: StockUnit.Kilogram,
  kilograms: StockUnit.Kilogram,
  kg: StockUnit.Kilogram,
  'ק"ג': StockUnit.Kilogram,
  קג: StockUnit.Kilogram,
  gram: StockUnit.Gram,
  grams: StockUnit.Gram,
  g: StockUnit.Gram,
  גרם: StockUnit.Gram,
  liter: StockUnit.Liter,
  liters: StockUnit.Liter,
  litre: StockUnit.Liter,
  litres: StockUnit.Liter,
  l: StockUnit.Liter,
  ליטר: StockUnit.Liter,
  ml: StockUnit.Milliliter,
  milliliter: StockUnit.Milliliter,
  milliliters: StockUnit.Milliliter,
  'מ"ל': StockUnit.Milliliter,
  package: StockUnit.Package,
  packages: StockUnit.Package,
  pack: StockUnit.Package,
  חבילה: StockUnit.Package,
  piece: StockUnit.Piece,
  pieces: StockUnit.Piece,
  unit: StockUnit.Piece,
  units: StockUnit.Piece,
  amount: StockUnit.Piece,
  "יח'": StockUnit.Piece,
  יח: StockUnit.Piece
}

// Resolves free text (e.g. from a parsed bulk-import row) to a known StockUnit, or
// null if it doesn't match any recognized preset/alias — callers fall back to treating
// the raw text as a custom unit in that case.
export function matchUnitAlias(text: string): StockUnit | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const exactPreset = UNIT_PRESETS.find((preset) => preset === trimmed)
  if (exactPreset) return exactPreset
  return UNIT_ALIASES[trimmed.toLowerCase()] ?? null
}

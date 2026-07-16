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

import { matchUnitAlias, resolveQuantityUnit, NO_UNIT, OTHER_UNIT, StockUnit } from '../../src/lib/units'

describe('resolveQuantityUnit', () => {
  it('returns null quantity and null unit when both fields are empty', () => {
    expect(resolveQuantityUnit({ quantityText: '', unit: NO_UNIT, customUnit: '' })).toEqual({
      quantity: null,
      unit: null,
      error: null
    })
  })

  it('parses a valid positive quantity with no unit selected', () => {
    expect(resolveQuantityUnit({ quantityText: '5', unit: NO_UNIT, customUnit: '' })).toEqual({
      quantity: 5,
      unit: null,
      error: null
    })
  })

  it('accepts a decimal quantity', () => {
    expect(resolveQuantityUnit({ quantityText: '0.5', unit: StockUnit.Kilogram, customUnit: '' })).toEqual({
      quantity: 0.5,
      unit: StockUnit.Kilogram,
      error: null
    })
  })

  it('resolves a preset unit alongside a quantity', () => {
    expect(resolveQuantityUnit({ quantityText: '2', unit: StockUnit.Kilogram, customUnit: '' })).toEqual({
      quantity: 2,
      unit: StockUnit.Kilogram,
      error: null
    })
  })

  it('resolves a custom unit when OTHER_UNIT is selected', () => {
    expect(resolveQuantityUnit({ quantityText: '3', unit: OTHER_UNIT, customUnit: '  crates  ' })).toEqual({
      quantity: 3,
      unit: 'crates',
      error: null
    })
  })

  it('treats an empty trimmed custom unit as no unit at all', () => {
    expect(resolveQuantityUnit({ quantityText: '3', unit: OTHER_UNIT, customUnit: '   ' })).toEqual({
      quantity: 3,
      unit: null,
      error: null
    })
  })

  it('rejects a non-numeric quantity', () => {
    expect(resolveQuantityUnit({ quantityText: 'abc', unit: NO_UNIT, customUnit: '' }).error).toBe('invalidQuantity')
  })

  it('rejects a zero quantity', () => {
    expect(resolveQuantityUnit({ quantityText: '0', unit: NO_UNIT, customUnit: '' }).error).toBe('invalidQuantity')
  })

  it('rejects a negative quantity', () => {
    expect(resolveQuantityUnit({ quantityText: '-1', unit: NO_UNIT, customUnit: '' }).error).toBe('invalidQuantity')
  })

  it('requires a quantity when a unit is selected', () => {
    expect(resolveQuantityUnit({ quantityText: '', unit: StockUnit.Liter, customUnit: '' }).error).toBe(
      'unitRequiresQuantity'
    )
  })

  it('requires a quantity when a custom unit is entered', () => {
    expect(resolveQuantityUnit({ quantityText: '', unit: OTHER_UNIT, customUnit: 'crates' }).error).toBe(
      'unitRequiresQuantity'
    )
  })
})

describe('matchUnitAlias', () => {
  it('matches an exact preset value verbatim', () => {
    expect(matchUnitAlias('ק"ג')).toBe(StockUnit.Kilogram)
  })

  it('matches common English aliases (bulk-import free text)', () => {
    expect(matchUnitAlias('kilo')).toBe(StockUnit.Kilogram)
    expect(matchUnitAlias('KG')).toBe(StockUnit.Kilogram)
    expect(matchUnitAlias('liters')).toBe(StockUnit.Liter)
    expect(matchUnitAlias('Liter')).toBe(StockUnit.Liter)
    expect(matchUnitAlias('pieces')).toBe(StockUnit.Piece)
    expect(matchUnitAlias('amount')).toBe(StockUnit.Piece)
  })

  it('matches Hebrew shorthand aliases', () => {
    expect(matchUnitAlias('קג')).toBe(StockUnit.Kilogram)
    expect(matchUnitAlias('יח')).toBe(StockUnit.Piece)
  })

  it('returns null for unrecognized text', () => {
    expect(matchUnitAlias('crates')).toBeNull()
    expect(matchUnitAlias('ארגזים')).toBeNull()
  })

  it('returns null for empty/blank text', () => {
    expect(matchUnitAlias('')).toBeNull()
    expect(matchUnitAlias('   ')).toBeNull()
  })
})

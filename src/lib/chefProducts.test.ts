import type { GroceryItem } from '../types'
import { isChefFoodProduct } from './chefProducts'

const item = (category: string): GroceryItem => ({
  key: '-item',
  item: 'item',
  category,
  bought: true,
  added_at: '2026-09-26T00:00:00.000Z'
})

describe('chef product filtering', () => {
  it('allows default food categories', () => {
    expect(isChefFoodProduct(item('ירקות'))).toBe(true)
    expect(isChefFoodProduct(item('מוצרי חלב וביצים'))).toBe(true)
    expect(isChefFoodProduct(item('מזווה'))).toBe(true)
  })

  it('excludes default non-food household categories', () => {
    expect(isChefFoodProduct(item('ניקיון וכביסה'))).toBe(false)
    expect(isChefFoodProduct(item('טיפוח אישי'))).toBe(false)
    expect(isChefFoodProduct(item('נייר ומוצרי היגיינה'))).toBe(false)
  })

  it('excludes custom categories that clearly describe non-food items', () => {
    expect(isChefFoodProduct(item('Bathroom paper and cleaning'))).toBe(false)
  })
})

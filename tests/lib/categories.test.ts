import { DEFAULT_CATEGORIES, OTHER_CATEGORY_NAME } from '../../src/lib/categories'

describe('categories constants', () => {
  it('includes exactly one protected category, matching OTHER_CATEGORY_NAME', () => {
    const protectedEntries = Object.values(DEFAULT_CATEGORIES).filter((c) => c.protected)
    expect(protectedEntries).toHaveLength(1)
    expect(protectedEntries[0].name).toBe(OTHER_CATEGORY_NAME)
  })

  it('gives every default category a unique name', () => {
    const names = Object.values(DEFAULT_CATEGORIES).map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives every default category a unique, non-negative order', () => {
    const orders = Object.values(DEFAULT_CATEGORIES).map((c) => c.order)
    expect(new Set(orders).size).toBe(orders.length)
    orders.forEach((order) => expect(order).toBeGreaterThanOrEqual(0))
  })

  it('gives every default category a non-empty color and icon', () => {
    Object.values(DEFAULT_CATEGORIES).forEach((c) => {
      expect(c.color.length).toBeGreaterThan(0)
      expect(c.icon.length).toBeGreaterThan(0)
    })
  })
})

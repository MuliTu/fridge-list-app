import { sortGroceryItems } from '../../src/lib/sortGroceryItems'
import type { GroceryItem } from '../../src/types'

const item = (overrides: Partial<GroceryItem>): GroceryItem => ({
  key: overrides.key || Math.random().toString(36),
  item: 'item',
  category: 'קטגוריה',
  bought: false,
  added_at: '2026-01-01T00:00:00.000Z',
  ...overrides
})

describe('sortGroceryItems', () => {
  it('default: unbought items come before bought items, each ordered by added_at', () => {
    const entries = [
      item({ key: 'a', item: 'Apples', bought: true, added_at: '2026-01-01T00:00:00.000Z' }),
      item({ key: 'b', item: 'Bread', bought: false, added_at: '2026-01-02T00:00:00.000Z' }),
      item({ key: 'c', item: 'Carrots', bought: false, added_at: '2026-01-01T00:00:00.000Z' })
    ]

    const sorted = sortGroceryItems(entries, 'default', 'en')

    expect(sorted.map((e) => e.key)).toEqual(['c', 'b', 'a'])
  })

  it('name-asc: sorts alphabetically A-Z, mixing bought/unbought (FR-9)', () => {
    const entries = [
      item({ key: 'milk', item: 'Milk', bought: false }),
      item({ key: 'apples', item: 'Apples', bought: true }),
      item({ key: 'eggs', item: 'Eggs', bought: false })
    ]

    const sorted = sortGroceryItems(entries, 'name-asc', 'en')

    expect(sorted.map((e) => e.item)).toEqual(['Apples', 'Eggs', 'Milk'])
  })

  it('name-desc: sorts alphabetically Z-A', () => {
    const entries = [item({ item: 'Milk' }), item({ item: 'Eggs' }), item({ item: 'Apples' })]

    const sorted = sortGroceryItems(entries, 'name-desc', 'en')

    expect(sorted.map((e) => e.item)).toEqual(['Milk', 'Eggs', 'Apples'])
  })

  it('name-asc is locale-aware (case-insensitive via Intl.Collator)', () => {
    const entries = [item({ item: 'apples' }), item({ item: 'Bread' })]

    const sorted = sortGroceryItems(entries, 'name-asc', 'en')

    expect(sorted.map((e) => e.item)).toEqual(['apples', 'Bread'])
  })

  it('updated-desc: newest modified_at first', () => {
    const entries = [
      item({ key: 'old', item: 'Milk', modified_at: '2026-01-01T09:00:00.000Z' }),
      item({ key: 'newest', item: 'Apples', modified_at: '2026-01-01T11:30:00.000Z' }),
      item({ key: 'mid', item: 'Eggs', modified_at: '2026-01-01T10:00:00.000Z' })
    ]

    const sorted = sortGroceryItems(entries, 'updated-desc', 'en')

    expect(sorted.map((e) => e.key)).toEqual(['newest', 'mid', 'old'])
  })

  it('updated-asc: oldest modified_at first', () => {
    const entries = [
      item({ key: 'old', item: 'Milk', modified_at: '2026-01-01T09:00:00.000Z' }),
      item({ key: 'newest', item: 'Apples', modified_at: '2026-01-01T11:30:00.000Z' }),
      item({ key: 'mid', item: 'Eggs', modified_at: '2026-01-01T10:00:00.000Z' })
    ]

    const sorted = sortGroceryItems(entries, 'updated-asc', 'en')

    expect(sorted.map((e) => e.key)).toEqual(['old', 'mid', 'newest'])
  })

  it('updated sort falls back to added_at when modified_at is absent', () => {
    const entries = [
      item({ key: 'never-touched', item: 'Milk', added_at: '2026-01-01T00:00:00.000Z', modified_at: undefined }),
      item({ key: 'touched', item: 'Eggs', added_at: '2025-01-01T00:00:00.000Z', modified_at: '2026-06-01T00:00:00.000Z' })
    ]

    const sorted = sortGroceryItems(entries, 'updated-desc', 'en')

    expect(sorted.map((e) => e.key)).toEqual(['touched', 'never-touched'])
  })

  it('does not mutate the input array', () => {
    const entries = [item({ key: 'a', item: 'Bread' }), item({ key: 'b', item: 'Apples' })]
    const original = [...entries]

    sortGroceryItems(entries, 'name-asc', 'en')

    expect(entries).toEqual(original)
  })
})

import { normalizeName } from '../../src/lib/normalizeName'

describe('normalizeName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeName('  חלב  ')).toBe('חלב')
  })

  it('lowercases ASCII content', () => {
    expect(normalizeName('Milk')).toBe('milk')
  })

  it('treats null and undefined as an empty string', () => {
    expect(normalizeName(null)).toBe('')
    expect(normalizeName(undefined)).toBe('')
  })

  it('treats an empty/whitespace-only string as empty', () => {
    expect(normalizeName('')).toBe('')
    expect(normalizeName('   ')).toBe('')
  })

  it('matches names that only differ by case/whitespace', () => {
    expect(normalizeName('  Milk ')).toBe(normalizeName('milk'))
  })

  // Known, accepted gap: this pins the current behavior down so it can't silently
  // regress further. Fixing it would need real normalization, out of scope here.
  it('does NOT match Hebrew singular/plural variants (known gap, not a bug)', () => {
    expect(normalizeName('עגבניות')).not.toBe(normalizeName('עגבניה'))
  })
})

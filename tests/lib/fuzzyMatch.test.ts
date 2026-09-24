import { isFuzzyProductMatch, rankFuzzyMatches } from '../../src/lib/fuzzyMatch'

describe('isFuzzyProductMatch', () => {
  it('matches an exact name (case/whitespace-insensitive)', () => {
    expect(isFuzzyProductMatch('חלב', ' חלב ')).toBe(true)
    expect(isFuzzyProductMatch('Milk', 'MILK')).toBe(true)
  })

  it('matches a singular/plural prefix drift (מלפפון -> מלפפונים)', () => {
    expect(isFuzzyProductMatch('מלפפון', 'מלפפונים')).toBe(true)
  })

  it('matches a near-typo of the same word (עגבניה -> עגבניות)', () => {
    expect(isFuzzyProductMatch('עגבניה', 'עגבניות')).toBe(true)
  })

  it('matches a near-typo against one word of a multi-word product (עגבניה -> עגבניות שרי)', () => {
    expect(isFuzzyProductMatch('עגבניה', 'עגבניות שרי')).toBe(true)
  })

  it('does not match unrelated products', () => {
    expect(isFuzzyProductMatch('חלב', 'לחם')).toBe(false)
    expect(isFuzzyProductMatch('עגבניה', 'מלפפונים')).toBe(false)
  })

  it('does not match on empty input', () => {
    expect(isFuzzyProductMatch('', 'מלפפונים')).toBe(false)
    expect(isFuzzyProductMatch('מלפפון', '')).toBe(false)
  })
})

describe('rankFuzzyMatches', () => {
  it('ranks an exact match ahead of a fuzzy one', () => {
    const candidates = [{ name: 'עגבניות שרי' }, { name: 'עגבניות' }]
    const ranked = rankFuzzyMatches('עגבניות', candidates)
    expect(ranked.map((c) => c.name)).toEqual(['עגבניות', 'עגבניות שרי'])
  })

  it('surfaces both plausible candidates for an ambiguous typo (עגבניה)', () => {
    const candidates = [{ key: 'a', name: 'עגבניות' }, { key: 'b', name: 'עגבניות שרי' }, { key: 'c', name: 'לחם' }]
    const ranked = rankFuzzyMatches('עגבניה', candidates)
    expect(ranked.map((c) => c.key).sort()).toEqual(['a', 'b'])
  })

  it('returns an empty array when nothing matches', () => {
    expect(rankFuzzyMatches('שוקולד', [{ name: 'חלב' }, { name: 'לחם' }])).toEqual([])
  })

  it('returns an empty array for empty input', () => {
    expect(rankFuzzyMatches('', [{ name: 'חלב' }])).toEqual([])
  })
})

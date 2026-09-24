import { formatDateTime } from '../../src/lib/formatDateTime'

describe('formatDateTime', () => {
  it('returns null for a missing value', () => {
    expect(formatDateTime(null)).toBeNull()
    expect(formatDateTime(undefined)).toBeNull()
    expect(formatDateTime('')).toBeNull()
  })

  it('returns null for an unparseable date string', () => {
    expect(formatDateTime('not-a-date')).toBeNull()
  })

  it('formats a valid ISO string into a non-empty display string', () => {
    const result = formatDateTime('2026-07-07T12:30:00.000Z')
    expect(result).not.toBeNull()
    expect(typeof result).toBe('string')
    expect(result!.length).toBeGreaterThan(0)
  })
})

import { isSafeHttpUrl } from './safeUrl'

describe('isSafeHttpUrl', () => {
  it('accepts https URLs (the legitimate Shufersal digital-invoice case)', () => {
    expect(isSafeHttpUrl('https://www.shufersal.co.il/invoice/abc')).toBe(true)
  })

  it('accepts plain http URLs', () => {
    expect(isSafeHttpUrl('http://example.com/receipt')).toBe(true)
  })

  it('rejects javascript: URLs (the stored-XSS-style vector)', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl('JavaScript:alert(1)')).toBe(false)
  })

  it('rejects data: URLs', () => {
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('rejects file: URLs', () => {
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false)
  })

  it('rejects unparseable garbage', () => {
    expect(isSafeHttpUrl('not a url')).toBe(false)
    expect(isSafeHttpUrl('://missing-scheme')).toBe(false)
  })

  it('rejects null, undefined, and empty strings', () => {
    expect(isSafeHttpUrl(null)).toBe(false)
    expect(isSafeHttpUrl(undefined)).toBe(false)
    expect(isSafeHttpUrl('')).toBe(false)
  })
})

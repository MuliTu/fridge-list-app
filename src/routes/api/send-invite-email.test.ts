import { escapeHtml, isValidEmail, sanitizeInvitedBy } from './send-invite-email'

describe('escapeHtml', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('neutralizes a script-tag injection attempt', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    )
  })

  it('escapes & first so already-escaped entities are not double-decodable back to markup', () => {
    // "&lt;" as literal input must become "&amp;lt;", not stay "&lt;"
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  it('leaves ordinary text (incl. Hebrew) untouched', () => {
    expect(escapeHtml('דני')).toBe('דני')
    expect(escapeHtml('Alice')).toBe('Alice')
  })
})

describe('isValidEmail', () => {
  it('accepts plausible addresses', () => {
    expect(isValidEmail('a@b.co')).toBe(true)
    expect(isValidEmail('someone@gmail.com')).toBe(true)
    expect(isValidEmail('first.last+tag@sub.example.co.il')).toBe(true)
  })

  it('rejects non-strings', () => {
    expect(isValidEmail(undefined)).toBe(false)
    expect(isValidEmail(null)).toBe(false)
    expect(isValidEmail(42)).toBe(false)
    expect(isValidEmail({})).toBe(false)
  })

  it('rejects addresses missing an @ or a domain dot', () => {
    expect(isValidEmail('nobody')).toBe(false)
    expect(isValidEmail('nobody@localhost')).toBe(false)
    expect(isValidEmail('@example.com')).toBe(false)
    expect(isValidEmail('a@b@example.com')).toBe(false)
  })

  it('rejects whitespace/newlines (header-injection guard)', () => {
    expect(isValidEmail('a@b.co\nBcc: evil@x.com')).toBe(false)
    expect(isValidEmail('a@b.co\r\nSubject: spam')).toBe(false)
    expect(isValidEmail('a b@example.com')).toBe(false)
    expect(isValidEmail('a@b.co ')).toBe(false)
  })

  it('rejects an over-long address', () => {
    const huge = `${'a'.repeat(300)}@example.com`
    expect(isValidEmail(huge)).toBe(false)
  })
})

describe('sanitizeInvitedBy', () => {
  it('returns null for missing/blank/non-string values', () => {
    expect(sanitizeInvitedBy(undefined)).toBeNull()
    expect(sanitizeInvitedBy(null)).toBeNull()
    expect(sanitizeInvitedBy(123)).toBeNull()
    expect(sanitizeInvitedBy('   ')).toBeNull()
  })

  it('collapses newlines to spaces and trims', () => {
    expect(sanitizeInvitedBy('Bcc:\nevil@x.com')).toBe('Bcc: evil@x.com')
    expect(sanitizeInvitedBy('  דני  ')).toBe('דני')
  })

  it('caps length at 200 characters', () => {
    const result = sanitizeInvitedBy('x'.repeat(500))
    expect(result).toHaveLength(200)
  })

  it('passes an ordinary name through unchanged', () => {
    expect(sanitizeInvitedBy('Alice')).toBe('Alice')
  })
})

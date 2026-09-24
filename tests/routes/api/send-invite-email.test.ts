import {
  createInvitationEmailMessage,
  escapeHtml,
  isValidInvitationEmail,
  normalizeInvitationEmailMessageInput,
  sanitizeInvitationDisplayText
} from '../../../src/modules/invitations/application/invitationEmailMessage'

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
    expect(isValidInvitationEmail('a@b.co')).toBe(true)
    expect(isValidInvitationEmail('someone@gmail.com')).toBe(true)
    expect(isValidInvitationEmail('first.last+tag@sub.example.co.il')).toBe(true)
  })

  it('rejects non-strings', () => {
    expect(isValidInvitationEmail(undefined)).toBe(false)
    expect(isValidInvitationEmail(null)).toBe(false)
    expect(isValidInvitationEmail(42)).toBe(false)
    expect(isValidInvitationEmail({})).toBe(false)
  })

  it('rejects addresses missing an @ or a domain dot', () => {
    expect(isValidInvitationEmail('nobody')).toBe(false)
    expect(isValidInvitationEmail('nobody@localhost')).toBe(false)
    expect(isValidInvitationEmail('@example.com')).toBe(false)
    expect(isValidInvitationEmail('a@b@example.com')).toBe(false)
  })

  it('rejects whitespace/newlines (header-injection guard)', () => {
    expect(isValidInvitationEmail('a@b.co\nBcc: evil@x.com')).toBe(false)
    expect(isValidInvitationEmail('a@b.co\r\nSubject: spam')).toBe(false)
    expect(isValidInvitationEmail('a b@example.com')).toBe(false)
    expect(isValidInvitationEmail('a@b.co ')).toBe(false)
  })

  it('rejects an over-long address', () => {
    const huge = `${'a'.repeat(300)}@example.com`
    expect(isValidInvitationEmail(huge)).toBe(false)
  })
})

describe('sanitizeInvitedBy', () => {
  it('returns null for missing/blank/non-string values', () => {
    expect(sanitizeInvitationDisplayText(undefined)).toBeNull()
    expect(sanitizeInvitationDisplayText(null)).toBeNull()
    expect(sanitizeInvitationDisplayText(123)).toBeNull()
    expect(sanitizeInvitationDisplayText('   ')).toBeNull()
  })

  it('collapses newlines to spaces and trims', () => {
    expect(sanitizeInvitationDisplayText('Bcc:\nevil@x.com')).toBe('Bcc: evil@x.com')
    expect(sanitizeInvitationDisplayText('  דני  ')).toBe('דני')
  })

  it('caps length at 200 characters', () => {
    const result = sanitizeInvitationDisplayText('x'.repeat(500))
    expect(result).toHaveLength(200)
  })

  it('passes an ordinary name through unchanged', () => {
    expect(sanitizeInvitationDisplayText('Alice')).toBe('Alice')
  })
})

describe('normalizeInvitationEmailMessageInput', () => {
  it('returns null when the recipient is invalid', () => {
    expect(normalizeInvitationEmailMessageInput({
      to: 'not-an-email',
      invitedBy: 'Alice',
      listName: 'Shared list'
    })).toBeNull()
  })

  it('sanitizes optional text fields and supplies the default list name', () => {
    expect(normalizeInvitationEmailMessageInput({
      to: 'invitee@example.com',
      invitedBy: ' Alice\nAdmin ',
      listName: ' '
    })).toEqual({
      to: 'invitee@example.com',
      invitedBy: 'Alice Admin',
      listName: 'רשימת הקניות המשותפת'
    })
  })
})

describe('createInvitationEmailMessage', () => {
  it('builds escaped html and plain text invitation content', () => {
    const message = createInvitationEmailMessage({
      to: 'invitee@example.com',
      invitedBy: '<Alice>',
      listName: 'Family & Friends'
    }, 'https://app.example.com')

    expect(message.subject).toBe('הוזמנת לרשימה "Family & Friends"')
    expect(message.text).toContain('<Alice> הוסיף/ה אותך')
    expect(message.html).toContain('&lt;Alice&gt; הוסיף/ה אותך')
    expect(message.html).toContain('Family &amp; Friends')
    expect(message.html).toContain('https://app.example.com')
  })
})

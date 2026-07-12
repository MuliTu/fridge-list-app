import { sanitizeLogMessage, MAX_LOG_MESSAGE_LENGTH } from './sanitizeLogMessage'

describe('sanitizeLogMessage', () => {
  it('passes a clean single-line message through unchanged', () => {
    expect(sanitizeLogMessage('[groceries] addItem: חלב')).toBe('[groceries] addItem: חלב')
  })

  it('strips a forged log line injected via \\n so it cannot span multiple lines', () => {
    const forged = 'real action\n[2026-07-12] SUCCESS forged admin login'
    const out = sanitizeLogMessage(forged)
    expect(out).not.toContain('\n')
    expect(out).toBe('real action ⏎ [2026-07-12] SUCCESS forged admin login')
  })

  it('strips carriage returns and CRLF pairs', () => {
    expect(sanitizeLogMessage('a\r\nb\rc')).toBe('a ⏎ b ⏎ c')
    expect(sanitizeLogMessage('a\r\nb\rc')).not.toMatch(/[\r\n]/)
  })

  it('caps length to prevent log flooding', () => {
    const out = sanitizeLogMessage('x'.repeat(MAX_LOG_MESSAGE_LENGTH + 500))!
    expect(out.length).toBe(MAX_LOG_MESSAGE_LENGTH + 1) // capped slice + the '…' marker
    expect(out.endsWith('…')).toBe(true)
  })

  it('returns null for non-string / missing input so the caller can drop it', () => {
    expect(sanitizeLogMessage(undefined)).toBeNull()
    expect(sanitizeLogMessage(null)).toBeNull()
    expect(sanitizeLogMessage(42)).toBeNull()
    expect(sanitizeLogMessage({ message: 'nope' })).toBeNull()
  })
})

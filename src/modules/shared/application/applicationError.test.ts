import { ApplicationError, type ApplicationErrorCode } from './applicationError'

describe('ApplicationError', () => {
  it.each<ApplicationErrorCode>([
    'invalid_input',
    'unauthenticated',
    'forbidden',
    'not_found',
    'conflict',
    'not_configured',
    'upstream_failed',
    'unavailable'
  ])('represents the transport-neutral %s failure', (code) => {
    const error = new ApplicationError(code, 'Internal diagnostic')

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ApplicationError')
    expect(error.code).toBe(code)
    expect(error.message).toBe('Internal diagnostic')
  })

  it('retains the original failure as internal diagnostic context', () => {
    const cause = new Error('provider secret')
    const error = new ApplicationError('upstream_failed', 'Provider request failed', cause)

    expect(error.cause).toBe(cause)
  })
})

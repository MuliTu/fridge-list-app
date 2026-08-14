/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import {
  createN8nMachineAuthenticator,
  N8N_GROCERIES_WRITE_SCOPE,
  N8N_SECRET_HEADER,
  REQUEST_ID_HEADER,
  N8nMachineAuthenticator
} from './machineAuthenticator.server'

const SECRET = 'a-long-random-test-secret'
const LIST_ID = 'household-list-1'

const authenticate = (authenticator: N8nMachineAuthenticator, presentedSecret?: string) => {
  const headers = new Headers()
  if (presentedSecret !== undefined) headers.set(N8N_SECRET_HEADER, presentedSecret)
  return authenticator.authenticate(headers)
}

describe('N8nMachineAuthenticator', () => {
  it('returns a narrowly scoped, list-restricted service principal', () => {
    const authenticator = new N8nMachineAuthenticator({
      sharedSecret: SECRET,
      allowedListId: LIST_ID
    })

    const principal = authenticate(authenticator, SECRET)

    expect(principal).toMatchObject({
      kind: 'service',
      service: 'n8n',
      scopes: [N8N_GROCERIES_WRITE_SCOPE]
    })
    expect([...principal.allowedListIds]).toEqual([LIST_ID])
    expect(principal.scopes).toHaveLength(1)
    expect(principal.allowedListIds.size).toBe(1)
  })

  it.each([
    { sharedSecret: undefined, allowedListId: LIST_ID },
    { sharedSecret: '', allowedListId: LIST_ID },
    { sharedSecret: '   ', allowedListId: LIST_ID },
    { sharedSecret: SECRET, allowedListId: undefined },
    { sharedSecret: SECRET, allowedListId: '' },
    { sharedSecret: SECRET, allowedListId: '   ' }
  ])('fails closed when configuration is incomplete: %p', (config) => {
    const authenticator = new N8nMachineAuthenticator(config)

    expect(() => authenticate(authenticator, SECRET)).toThrow(
      expect.objectContaining({
        code: 'not_configured',
        message: 'Machine authentication is not configured'
      })
    )
  })

  it.each([undefined, '', 'wrong', `${SECRET}-suffix`])(
    'rejects a missing or invalid presented secret: %p',
    (presentedSecret) => {
      const authenticator = new N8nMachineAuthenticator({
        sharedSecret: SECRET,
        allowedListId: LIST_ID
      })

      expect(() => authenticate(authenticator, presentedSecret)).toThrow(
        expect.objectContaining({
          code: 'unauthenticated',
          message: 'Invalid machine credentials'
        })
      )
    }
  )

  it('reads only the configured header through the narrow header-reader contract', () => {
    const get = jest.fn(() => SECRET)
    const authenticator = new N8nMachineAuthenticator({
      sharedSecret: SECRET,
      allowedListId: LIST_ID
    })

    authenticator.authenticate({ get })

    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(N8N_SECRET_HEADER)
  })

  it('constructs the authenticator from the documented environment keys', () => {
    const authenticator = createN8nMachineAuthenticator({
      N8N_WRITE_SECRET: SECRET,
      N8N_ALLOWED_LIST_ID: ` ${LIST_ID} `
    })

    const principal = authenticate(authenticator, SECRET)

    expect([...principal.allowedListIds]).toEqual([LIST_ID])
  })

  it('creates a request context with a validated caller request ID', () => {
    const authenticator = new N8nMachineAuthenticator(
      { sharedSecret: SECRET, allowedListId: LIST_ID },
      () => 'generated-id'
    )
    const headers = new Headers({
      [N8N_SECRET_HEADER]: SECRET,
      [REQUEST_ID_HEADER]: ' n8n-run:123 '
    })
    const now = new Date('2026-08-02T08:00:00.000Z')

    const context = authenticator.authenticateRequest(headers, now)

    expect(context).toMatchObject({ requestId: 'n8n-run:123', now })
    expect(context.principal.service).toBe('n8n')
  })

  it.each(['', 'contains spaces', '../escape', 'x'.repeat(129)])(
    'replaces an invalid request ID: %p',
    (requestId) => {
      const authenticator = new N8nMachineAuthenticator(
        { sharedSecret: SECRET, allowedListId: LIST_ID },
        () => 'generated-id'
      )
      const headers = new Headers({ [N8N_SECRET_HEADER]: SECRET, [REQUEST_ID_HEADER]: requestId })

      expect(authenticator.authenticateRequest(headers).requestId).toBe('generated-id')
    }
  )

  it('does not create or read a request ID when machine credentials are invalid', () => {
    const generateRequestId = jest.fn(() => 'generated-id')
    const get = jest.fn((name: string) => (name === N8N_SECRET_HEADER ? 'wrong' : 'attacker-id'))
    const authenticator = new N8nMachineAuthenticator(
      { sharedSecret: SECRET, allowedListId: LIST_ID },
      generateRequestId
    )

    expect(() => authenticator.authenticateRequest({ get })).toThrow(
      expect.objectContaining({ code: 'unauthenticated' })
    )
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(N8N_SECRET_HEADER)
    expect(generateRequestId).not.toHaveBeenCalled()
  })
})

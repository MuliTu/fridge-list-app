jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { createSendInvitationEmailHandler } from '../../../../src/modules/invitations/infrastructure/invitationEmailHttp.server'

class TestResponse {
  readonly status: number

  constructor(private readonly body: unknown, init: ResponseInit = {}) {
    this.status = init.status ?? 200
  }

  async json() {
    return this.body
  }

  static json(body: unknown, init?: ResponseInit) {
    return new TestResponse(body, init)
  }
}

const createLogger = () => ({
  error: jest.fn(),
  success: jest.fn(),
  warn: jest.fn()
})

const createPostRequest = (body: unknown): Request =>
  ({ json: jest.fn(async () => body) }) as unknown as Request

describe('createSendInvitationEmailHandler', () => {
  const originalResponse = globalThis.Response

  beforeAll(() => {
    ;(globalThis as any).Response = TestResponse
  })

  afterAll(() => {
    globalThis.Response = originalResponse
  })

  it('rejects invalid recipients before constructing an email sender', async () => {
    const createEmailSender = jest.fn()
    const handler = createSendInvitationEmailHandler({
      createEmailSender,
      logger: createLogger()
    })

    const response = await handler({
      request: createPostRequest({ to: 'not-an-email', invitedBy: 'Alice' })
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: true,
      message: 'invalid recipient'
    })
    expect(createEmailSender).not.toHaveBeenCalled()
  })

  it('returns a soft configuration failure when SMTP is unavailable', async () => {
    const handler = createSendInvitationEmailHandler({
      createEmailSender: () => null,
      logger: createLogger()
    })

    const response = await handler({
      request: createPostRequest({ to: 'invitee@example.com' })
    })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: true,
      message: 'smtp_not_configured'
    })
  })

  it('sends a sanitized invitation message', async () => {
    const send = jest.fn().mockResolvedValue(undefined)
    const handler = createSendInvitationEmailHandler({
      createEmailSender: () => ({ send }),
      logger: createLogger()
    })

    const response = await handler({
      request: createPostRequest({
        to: 'invitee@example.com',
        invitedBy: ' Alice\nAdmin ',
        listName: 'Family & Friends'
      })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ error: false })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'invitee@example.com',
      subject: 'הוזמנת לרשימה "Family & Friends"',
      text: expect.stringContaining('Alice Admin הוסיף/ה אותך'),
      html: expect.stringContaining('Family &amp; Friends')
    }))
  })

  it('maps provider send failures to a safe response', async () => {
    const send = jest.fn().mockRejectedValue(new Error('smtp secret leaked upstream'))
    const handler = createSendInvitationEmailHandler({
      createEmailSender: () => ({ send }),
      logger: createLogger()
    })

    const response = await handler({
      request: createPostRequest({ to: 'invitee@example.com' })
    })

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error: true,
      message: 'send_failed'
    })
  })
})

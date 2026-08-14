jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

const sendMail = jest.fn()
const createTransport = jest.fn(() => ({ sendMail }))

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport }
}))

import { createSmtpInvitationEmailSender } from './nodemailerInvitationEmailSender.server'

describe('createSmtpInvitationEmailSender', () => {
  beforeEach(() => {
    createTransport.mockClear()
    sendMail.mockReset()
    sendMail.mockResolvedValue({})
  })

  it.each(['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'] as const)(
    'returns null when %s is missing',
    missingKey => {
      const environment = {
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '465',
        SMTP_USER: 'user',
        SMTP_PASS: 'secret'
      }
      delete environment[missingKey]

      expect(createSmtpInvitationEmailSender(environment)).toBeNull()
      expect(createTransport).not.toHaveBeenCalled()
    }
  )

  it('configures the provider and sends the message with the configured sender', async () => {
    const sender = createSmtpInvitationEmailSender({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_USER: 'user',
      SMTP_PASS: 'secret',
      SMTP_FROM: 'Fridge <hello@example.com>'
    })

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'user', pass: 'secret' }
    })

    await sender?.send({
      to: 'invitee@example.com',
      subject: 'Invitation',
      text: 'Join us',
      html: '<p>Join us</p>'
    })

    expect(sendMail).toHaveBeenCalledWith({
      from: 'Fridge <hello@example.com>',
      to: 'invitee@example.com',
      subject: 'Invitation',
      text: 'Join us',
      html: '<p>Join us</p>'
    })
  })

  it('falls back to the SMTP user as the sender address', async () => {
    const sender = createSmtpInvitationEmailSender({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_USER: 'user@example.com',
      SMTP_PASS: 'secret'
    })

    await sender?.send({
      to: 'invitee@example.com',
      subject: 'Invitation',
      text: 'Join us',
      html: '<p>Join us</p>'
    })

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: false }))
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'user@example.com' }))
  })
})

import '@tanstack/react-start/server-only'
import nodemailer from 'nodemailer'

export interface InvitationEmailMessage {
  to: string
  subject: string
  text: string
  html: string
}

export interface InvitationEmailSender {
  send(message: InvitationEmailMessage): Promise<void>
}

interface SmtpEnvironment {
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASS?: string
  SMTP_FROM?: string
}

/**
 * Build the SMTP provider adapter from environment configuration.
 *
 * A null result deliberately preserves the route's existing fail-soft behavior
 * when SMTP has not been provisioned.
 */
export function createSmtpInvitationEmailSender(
  environment: SmtpEnvironment
): InvitationEmailSender | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = environment
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  })

  return {
    async send(message) {
      await transport.sendMail({
        from: SMTP_FROM || SMTP_USER,
        ...message
      })
    }
  }
}

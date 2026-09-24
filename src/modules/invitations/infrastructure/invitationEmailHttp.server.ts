import '@tanstack/react-start/server-only'

import { logger as defaultLogger } from '../../../lib/logger'
import {
  createInvitationEmailMessage,
  normalizeInvitationEmailMessageInput
} from '../application/invitationEmailMessage'
import { createSmtpInvitationEmailSender, type InvitationEmailSender } from './nodemailerInvitationEmailSender.server'

type Logger = Pick<typeof defaultLogger, 'error' | 'success' | 'warn'>

type SendInvitationEmailHandlerDependencies = {
  createEmailSender?: () => InvitationEmailSender | null
  logger?: Logger
}

export const createSendInvitationEmailHandler = (
  dependencies: SendInvitationEmailHandlerDependencies = {}
) => {
  const createEmailSender = dependencies.createEmailSender ?? (() => createSmtpInvitationEmailSender(process.env))
  const logger = dependencies.logger ?? defaultLogger

  return async ({ request }: { request: Request }): Promise<Response> => {
    const body = await request.json()
    const normalized = normalizeInvitationEmailMessageInput({
      to: body.to,
      invitedBy: body.invitedBy,
      listName: body.listName
    })

    logger.success(
      `[send-invite-email] request received: to=${String(body.to)} invitedBy=${String(body.invitedBy || 'unknown')} listName=${String(body.listName || 'unknown')}`
    )

    if (!normalized) {
      logger.warn(`[send-invite-email] rejected invalid recipient: ${JSON.stringify(body.to)}`)
      return Response.json({ error: true, message: 'invalid recipient' }, { status: 400 })
    }

    try {
      const emailSender = createEmailSender()
      if (!emailSender) {
        logger.warn('[send-invite-email] SMTP env vars not configured, skipping send')
        return Response.json({ error: true, message: 'smtp_not_configured' }, { status: 503 })
      }

      await emailSender.send(createInvitationEmailMessage(normalized))
      logger.success(`[send-invite-email] sent: to=${normalized.to}`)
      return Response.json({ error: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`[send-invite-email] send failed: ${message}`)
      return Response.json({ error: true, message: 'send_failed' }, { status: 502 })
    }
  }
}

import { createFileRoute } from '@tanstack/react-router'
import nodemailer from 'nodemailer'
import { logger } from '../../lib/logger'

// Same stable custom domain e2e-deploy-check.yml already hardcodes for the same
// reason: the git-branch-aliased/per-deployment Vercel URLs are unstable and, for
// previews, behind Deployment Protection — an invite email needs one URL that will
// always resolve for whoever opens it, weeks or months later.
const APP_URL = 'https://fridge-list-app.vercel.app'

export const Route = createFileRoute('/api/send-invite-email')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { to, invitedBy } = await request.json()
        logger.success(`[send-invite-email] request received: to=${to} invitedBy=${invitedBy || 'unknown'}`)

        const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env
        if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
          // Missing SMTP config is expected until the user provisions it (a real
          // secret this codebase can't generate on its own) — fail soft so a missing
          // env var never blocks the actual invite, which already succeeded in
          // Firebase before this route is ever called.
          logger.warn('[send-invite-email] SMTP env vars not configured, skipping send')
          return Response.json({ error: true, message: 'smtp_not_configured' }, { status: 503 })
        }

        try {
          const transport = nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT),
            secure: Number(SMTP_PORT) === 465,
            auth: { user: SMTP_USER, pass: SMTP_PASS }
          })

          const inviterLine = invitedBy ? `${invitedBy} הוסיף/ה אותך` : 'הוזמנת'
          await transport.sendMail({
            from: SMTP_FROM || SMTP_USER,
            to,
            subject: 'הוזמנת לרשימת הקניות המשותפת',
            text: `${inviterLine} כעורך/ת ברשימת הקניות המשותפת.\n\nהתחברו עם חשבון ה-Google של הכתובת הזו (${to}) בכתובת:\n${APP_URL}\n\nלאחר ההתחברות תוכלו לערוך את הרשימה, לא רק לצפות בה.`,
            html: `<p>${inviterLine} כעורך/ת ברשימת הקניות המשותפת.</p><p>התחברו עם חשבון ה-Google של הכתובת הזו (<b>${to}</b>) בכתובת:</p><p><a href="${APP_URL}">${APP_URL}</a></p><p>לאחר ההתחברות תוכלו לערוך את הרשימה, לא רק לצפות בה.</p>`
          })
          logger.success(`[send-invite-email] sent: to=${to}`)
          return Response.json({ error: false })
        } catch (err: any) {
          logger.error(`[send-invite-email] send failed: ${err.message}`)
          return Response.json({ error: true, message: 'send_failed' }, { status: 502 })
        }
      }
    }
  }
})

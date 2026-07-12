import { createFileRoute } from '@tanstack/react-router'
import nodemailer from 'nodemailer'
import { logger } from '../../lib/logger'

// Same stable custom domain e2e-deploy-check.yml already hardcodes for the same
// reason: the git-branch-aliased/per-deployment Vercel URLs are unstable and, for
// previews, behind Deployment Protection — an invite email needs one URL that will
// always resolve for whoever opens it, weeks or months later.
const APP_URL = 'https://fridge-list-app.vercel.app'

// This route is currently UNAUTHENTICATED. The proper next step is verifying a
// Firebase ID token so only signed-in admins can trigger a send (otherwise, once
// SMTP is provisioned, anyone who can reach this endpoint could send invite emails
// from the app's address to arbitrary recipients). That requires the Firebase Admin
// SDK + a service-account credential this app deliberately doesn't have (see CLAUDE.md
// — Storage/Blaze was rejected for the same "no service account" reason), so it's a
// larger change tracked separately. This PR is scoped to the two wins that need no new
// infra: validating/normalizing the input and HTML-escaping user-controlled output.

/** Escape the five HTML-significant characters so user-controlled text can't inject
 *  markup (or a `<script>`/attribute-breakout) into the email's `html` body. */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Plausible-email check, intentionally strict about whitespace/control chars: exactly
 *  one `@`, a dot in the domain, and no whitespace anywhere — the last part is what
 *  prevents SMTP header injection via a newline in the recipient address. Not a full
 *  RFC 5322 validator (nor should it be — we only need "safe to hand to sendMail"). */
export function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length > 254) return false // RFC 5321 max address length
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/** Normalize the optional `invitedBy` display name: must be a string, newlines
 *  stripped (defense in depth — it's only ever escaped into an HTML body, never a
 *  header, but keep it single-line and bounded), capped at 200 chars. Returns null for
 *  a missing/blank value so the caller falls back to the generic Hebrew greeting. */
export function sanitizeInvitedBy(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
  return cleaned || null
}

export const Route = createFileRoute('/api/send-invite-email')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { to, invitedBy, listName } = await request.json()
        logger.success(
          `[send-invite-email] request received: to=${to} invitedBy=${invitedBy || 'unknown'} listName=${listName || 'unknown'}`
        )

        if (!isValidEmail(to)) {
          logger.warn(`[send-invite-email] rejected invalid recipient: ${JSON.stringify(to)}`)
          return Response.json({ error: true, message: 'invalid recipient' }, { status: 400 })
        }
        const safeInvitedBy = sanitizeInvitedBy(invitedBy)
        // Same sanitization as invitedBy — a list name is just as user-controlled
        // (owner-chosen free text) and lands in the same HTML/text email body.
        const safeListName = sanitizeInvitedBy(listName) || 'רשימת הקניות המשותפת'

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

          // Plain-text body uses the sanitized (but unescaped) value; the HTML body
          // escapes every user-controlled value — `invitedBy` and `to` — before it's
          // interpolated, so neither can inject markup. `to` is a validated email but
          // the regex still permits some HTML-significant chars (e.g. `<`, `'`), so it
          // gets escaped in the HTML body too, not just relied on.
          const textInviterLine = safeInvitedBy ? `${safeInvitedBy} הוסיף/ה אותך` : 'הוזמנת'
          const htmlInviterLine = safeInvitedBy ? `${escapeHtml(safeInvitedBy)} הוסיף/ה אותך` : 'הוזמנת'
          const htmlTo = escapeHtml(to)
          const htmlListName = escapeHtml(safeListName)
          await transport.sendMail({
            from: SMTP_FROM || SMTP_USER,
            to,
            subject: `הוזמנת לרשימה "${safeListName}"`,
            text: `${textInviterLine} כעורך/ת ברשימה "${safeListName}".\n\nהתחברו עם חשבון ה-Google של הכתובת הזו (${to}) בכתובת:\n${APP_URL}\n\nלאחר ההתחברות תוכלו לערוך את הרשימה, לא רק לצפות בה.`,
            html: `<p>${htmlInviterLine} כעורך/ת ברשימה "${htmlListName}".</p><p>התחברו עם חשבון ה-Google של הכתובת הזו (<b>${htmlTo}</b>) בכתובת:</p><p><a href="${APP_URL}">${APP_URL}</a></p><p>לאחר ההתחברות תוכלו לערוך את הרשימה, לא רק לצפות בה.</p>`
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

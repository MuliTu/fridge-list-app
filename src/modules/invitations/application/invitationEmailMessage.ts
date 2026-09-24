export const INVITATION_APP_URL = 'https://fridge-list-app.vercel.app'

export const DEFAULT_INVITATION_LIST_NAME = 'רשימת הקניות המשותפת'

export type InvitationEmailMessageInput = {
  to: unknown
  invitedBy: unknown
  listName: unknown
}

export type ValidInvitationEmailMessageInput = {
  to: string
  invitedBy: string | null
  listName: string
}

export const escapeHtml = (value: string): string => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const isValidInvitationEmail = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  if (value.length > 254) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export const sanitizeInvitationDisplayText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
  return cleaned || null
}

export const normalizeInvitationEmailMessageInput = (
  input: InvitationEmailMessageInput
): ValidInvitationEmailMessageInput | null => {
  if (!isValidInvitationEmail(input.to)) return null

  return {
    to: input.to,
    invitedBy: sanitizeInvitationDisplayText(input.invitedBy),
    listName: sanitizeInvitationDisplayText(input.listName) || DEFAULT_INVITATION_LIST_NAME
  }
}

export const createInvitationEmailMessage = (
  input: ValidInvitationEmailMessageInput,
  appUrl = INVITATION_APP_URL
) => {
  const textInviterLine = input.invitedBy ? `${input.invitedBy} הוסיף/ה אותך` : 'הוזמנת'
  const htmlInviterLine = input.invitedBy ? `${escapeHtml(input.invitedBy)} הוסיף/ה אותך` : 'הוזמנת'
  const htmlTo = escapeHtml(input.to)
  const htmlListName = escapeHtml(input.listName)

  return {
    to: input.to,
    subject: `הוזמנת לרשימה "${input.listName}"`,
    text: `${textInviterLine} כעורך/ת ברשימה "${input.listName}".\n\nהתחברו עם חשבון ה-Google של הכתובת הזו (${input.to}) בכתובת:\n${appUrl}\n\nלאחר ההתחברות תוכלו לערוך את הרשימה, לא רק לצפות בה.`,
    html: `<p>${htmlInviterLine} כעורך/ת ברשימה "${htmlListName}".</p><p>התחברו עם חשבון ה-Google של הכתובת הזו (<b>${htmlTo}</b>) בכתובת:</p><p><a href="${appUrl}">${appUrl}</a></p><p>לאחר ההתחברות תוכלו לערוך את הרשימה, לא רק לצפות בה.</p>`
  }
}

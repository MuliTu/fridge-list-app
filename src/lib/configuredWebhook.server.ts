import '@tanstack/react-start/server-only'
import { ApplicationError } from '../modules/shared'

/** Configuration is server-owned; do not accept request-provided destinations. */
export function configuredWebhook(value: string | undefined): string {
  try {
    const url = new URL(value?.trim() ?? '')
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error()
    return url.href
  } catch {
    throw new ApplicationError('unavailable', 'Optional webhook is not configured')
  }
}

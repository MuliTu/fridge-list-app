export type ApplicationErrorCode =
  | 'invalid_input'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'not_configured'
  | 'upstream_failed'
  | 'unavailable'

export class ApplicationError extends Error {
  constructor(
    readonly code: ApplicationErrorCode,
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'ApplicationError'
  }
}

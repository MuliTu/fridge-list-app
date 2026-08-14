import { ApplicationError, type ApplicationErrorCode } from '../application/applicationError'

type HttpError = {
  status: number
  message: string
}

const APPLICATION_ERROR_HTTP_MAP: Record<ApplicationErrorCode, HttpError> = {
  invalid_input: { status: 400, message: 'Invalid request' },
  unauthenticated: { status: 401, message: 'Unauthorized' },
  forbidden: { status: 403, message: 'Forbidden' },
  not_found: { status: 404, message: 'Not found' },
  conflict: { status: 409, message: 'Conflict' },
  not_configured: { status: 500, message: 'Server not configured' },
  upstream_failed: { status: 502, message: 'Upstream service failed' },
  unavailable: { status: 503, message: 'Service unavailable' }
}

const INTERNAL_ERROR: HttpError = { status: 500, message: 'Internal server error' }

export const mapErrorToHttp = (error: unknown): HttpError =>
  error instanceof ApplicationError ? APPLICATION_ERROR_HTTP_MAP[error.code] : INTERNAL_ERROR

export const toHttpErrorResponse = (error: unknown): Response => {
  const mapped = mapErrorToHttp(error)
  return Response.json({ error: true, message: mapped.message }, { status: mapped.status })
}

/** @jest-environment node */

import { ApplicationError, type ApplicationErrorCode } from '../application/applicationError'
import { mapErrorToHttp, toHttpErrorResponse } from './httpErrorMapper'

describe('HTTP application-error mapper', () => {
  it.each<[ApplicationErrorCode, number, string]>([
    ['invalid_input', 400, 'Invalid request'],
    ['unauthenticated', 401, 'Unauthorized'],
    ['forbidden', 403, 'Forbidden'],
    ['not_found', 404, 'Not found'],
    ['conflict', 409, 'Conflict'],
    ['not_configured', 500, 'Server not configured'],
    ['upstream_failed', 502, 'Upstream service failed'],
    ['unavailable', 503, 'Service unavailable']
  ])('maps %s to HTTP %i', (code, status, message) => {
    expect(mapErrorToHttp(new ApplicationError(code, 'provider secret or internal detail'))).toEqual({
      status,
      message
    })
  })

  it('maps unknown errors to a generic 500 response', async () => {
    const response = toHttpErrorResponse(new Error('database password'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: true, message: 'Internal server error' })
  })

  it('never exposes application messages or nested provider causes', async () => {
    const response = toHttpErrorResponse(
      new ApplicationError('upstream_failed', 'Bearer private-token', new Error('provider response body'))
    )
    const serialized = JSON.stringify(await response.json())

    expect(response.status).toBe(502)
    expect(serialized).toBe(JSON.stringify({ error: true, message: 'Upstream service failed' }))
    expect(serialized).not.toContain('private-token')
    expect(serialized).not.toContain('provider response')
  })
})

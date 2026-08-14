import '@tanstack/react-start/server-only'

import { randomUUID } from 'node:crypto'

import { ApplicationError, type RequestContext, type UserPrincipal } from '../../shared'
import { toHttpErrorResponse } from '../../shared/server'
import type { AuthenticateUserService } from '../application/authenticateUser.service'

export const USER_REQUEST_ID_HEADER = 'x-request-id'

export type UserRequestContext = Omit<RequestContext, 'principal'> & {
  principal: UserPrincipal
}

export type AuthenticatedInputParser<Input> = (request: Request) => Input | Promise<Input>
export type AuthenticatedUserUseCase<Input> = (
  context: UserRequestContext,
  input: Input
) => Response | Promise<Response>

type AuthenticationService = Pick<AuthenticateUserService, 'execute'>

export type AuthenticatedUserHandlerDependencies = {
  authenticationService: AuthenticationService
  generateRequestId?: () => string
  now?: () => Date
}

const normalizeRequestId = (value: string | null): string | null => {
  const candidate = value?.trim()
  return candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate) ? candidate : null
}

export const parseJsonRequest = async <Input>(request: Request): Promise<Input> => {
  try {
    return (await request.json()) as Input
  } catch (error) {
    throw new ApplicationError('invalid_input', 'Request body must be valid JSON', error)
  }
}

/**
 * Adapts an authenticated browser request to a transport-neutral application
 * service. Authentication always completes before the parser or use case runs.
 */
export class AuthenticatedUserHandler {
  private readonly generateRequestId: () => string
  private readonly now: () => Date

  constructor(private readonly dependencies: AuthenticatedUserHandlerDependencies) {
    this.generateRequestId = dependencies.generateRequestId ?? randomUUID
    this.now = dependencies.now ?? (() => new Date())
  }

  async handle<Input>(
    request: Request,
    parseInput: AuthenticatedInputParser<Input>,
    execute: AuthenticatedUserUseCase<Input>
  ): Promise<Response> {
    try {
      const requestId =
        normalizeRequestId(request.headers.get(USER_REQUEST_ID_HEADER)) ?? this.generateRequestId()
      const now = this.now()
      const principal = await this.dependencies.authenticationService.execute(
        request.headers.get('authorization')
      )
      const context: UserRequestContext = {
        principal,
        requestId,
        now
      }
      const input = await parseInput(request)
      return await execute(context, input)
    } catch (error) {
      return toHttpErrorResponse(error)
    }
  }
}

import { ApplicationError, type RequestContext } from '../../shared'
import {
  CLIENT_EVENT_NAMES,
  type ClientEventLevel,
  type ClientEventName,
  type ClientEventRecorder
} from './clientEventRecorder'

export type RecordClientEventInput = {
  name: unknown
  level: unknown
}

const eventNames = new Set<string>(CLIENT_EVENT_NAMES)
const levels = new Set<string>(['success', 'warn', 'error'])

const isExactEventObject = (input: unknown): input is Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const keys = Object.keys(input)
  return keys.length === 2 && keys.includes('name') && keys.includes('level')
}

export class RecordClientEventService {
  constructor(private readonly recorder: ClientEventRecorder) {}

  async execute(context: RequestContext, input: unknown): Promise<void> {
    if (context.principal.kind !== 'user') {
      throw new ApplicationError('forbidden', 'Client events require a user principal')
    }
    if (!isExactEventObject(input) || typeof input.name !== 'string' || !eventNames.has(input.name)) {
      throw new ApplicationError('invalid_input', 'Client event name is invalid')
    }
    if (typeof input.level !== 'string' || !levels.has(input.level)) {
      throw new ApplicationError('invalid_input', 'Client event level is invalid')
    }

    await this.recorder.record({
      name: input.name as ClientEventName,
      level: input.level as ClientEventLevel,
      userId: context.principal.uid,
      requestId: context.requestId,
      occurredAt: context.now.toISOString()
    })
  }
}

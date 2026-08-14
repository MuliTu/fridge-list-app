import '@tanstack/react-start/server-only'

import type { ClientEventRecord, ClientEventRecorder } from '../application/clientEventRecorder'

export type StructuredLogger = {
  success(message: string): void
  warn(message: string): void
  error(message: string): void
}

export class StructuredClientEventLogger implements ClientEventRecorder {
  constructor(private readonly logger: StructuredLogger) {}

  record(event: ClientEventRecord): void {
    this.logger[event.level](`[client-event] ${JSON.stringify(event)}`)
  }
}

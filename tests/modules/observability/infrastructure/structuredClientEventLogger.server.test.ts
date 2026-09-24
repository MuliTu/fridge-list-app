jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { StructuredClientEventLogger, type StructuredLogger } from '../../../../src/modules/observability/infrastructure/structuredClientEventLogger.server'

describe('StructuredClientEventLogger', () => {
  it('logs only the already-bounded structured record', () => {
    const logger: jest.Mocked<StructuredLogger> = {
      success: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }

    new StructuredClientEventLogger(logger).record({
      name: 'receipts.saveReceipt',
      level: 'warn',
      userId: 'user-1',
      requestId: 'request-1',
      occurredAt: '2026-08-02T10:00:00.000Z'
    })

    expect(logger.warn).toHaveBeenCalledWith(
      '[client-event] {"name":"receipts.saveReceipt","level":"warn","userId":"user-1","requestId":"request-1","occurredAt":"2026-08-02T10:00:00.000Z"}'
    )
    expect(logger.success).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })
})

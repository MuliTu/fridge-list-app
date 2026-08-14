import type { RequestContext } from '../../shared'
import type { ClientEventRecorder } from './clientEventRecorder'
import { RecordClientEventService } from './recordClientEvent.service'

const context: RequestContext = {
  principal: {
    kind: 'user',
    uid: 'user-1',
    email: 'user@example.com',
    emailVerified: true
  },
  requestId: 'request-1',
  now: new Date('2026-08-02T10:00:00.000Z')
}

describe('RecordClientEventService', () => {
  it('records a bounded structured event without email or user content', async () => {
    const recorder: jest.Mocked<ClientEventRecorder> = { record: jest.fn() }

    await new RecordClientEventService(recorder).execute(context, {
      name: 'groceries.setBought',
      level: 'success'
    })

    expect(recorder.record).toHaveBeenCalledWith({
      name: 'groceries.setBought',
      level: 'success',
      userId: 'user-1',
      requestId: 'request-1',
      occurredAt: '2026-08-02T10:00:00.000Z'
    })
    expect(JSON.stringify(recorder.record.mock.calls)).not.toContain('user@example.com')
  })

  it.each([
    ['a bearer token', { name: 'Bearer.eyJ.secret', level: 'error' }],
    ['receipt content', { name: 'receipts.milkAndCreditCard1234', level: 'success' }],
    ['an arbitrary object', { name: { nested: 'secret' }, level: 'warn' }],
    ['extra arbitrary fields', { name: 'groceries.setBought', level: 'success', receipt: { total: 42 } }],
    ['an unsupported level', { name: 'groceries.setBought', level: 'debug' }]
  ])('rejects %s before recording', async (_case, input) => {
    const recorder: jest.Mocked<ClientEventRecorder> = { record: jest.fn() }

    await expect(new RecordClientEventService(recorder).execute(context, input)).rejects.toEqual(
      expect.objectContaining({ code: 'invalid_input' })
    )
    expect(recorder.record).not.toHaveBeenCalled()
  })
})

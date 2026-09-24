/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

const mockGetPrismaClient = jest.fn()

jest.mock('./shared/server/prisma', () => ({
  getPrismaClient: (environment: unknown) => mockGetPrismaClient(environment)
}))

import { ServerComposition, type ServerEnvironment } from './composition.server'

const serviceAccount = JSON.stringify({
  client_email: 'firebase-admin@example.test',
  private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----'
})

const completeEnvironment: ServerEnvironment = {
  FIREBASE_DATABASE_URL: 'https://example-default-rtdb.europe-west1.firebasedatabase.app',
  FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccount,
  GITHUB_RELEASES_TOKEN: 'github-token',
  CATEGORIZE_ITEM_WEBHOOK_URL: 'https://n8n.example.test/webhook/categorize-item',
  SUBMIT_FEEDBACK_WEBHOOK_URL: 'https://n8n.example.test/webhook/feedback',
  RECEIPT_SCAN_URL: 'https://n8n.example.test/webhook/receipt-scan',
  RECEIPT_URL_SCAN_ENDPOINT: 'https://n8n.example.test/webhook/receipt-url-scan',
  N8N_ALLOWED_LIST_ID: 'household-list',
  N8N_WRITE_SECRET: 'a-long-test-secret'
}

describe('ServerComposition', () => {
  beforeEach(() => {
    mockGetPrismaClient.mockReset()
    mockGetPrismaClient.mockReturnValue({
      groceryItem: { findMany: jest.fn() },
      householdList: { findFirst: jest.fn() }
    })
  })

  it('constructs and caches the n8n grocery capability in one root', () => {
    const composition = new ServerComposition({ environment: completeEnvironment })

    const first = composition.getN8nGroceryWriteDependencies()
    const second = composition.getN8nGroceryWriteDependencies()

    expect(second).toBe(first)
    expect(second.service).toBe(first.service)
  })

  it('fails browser grocery commands closed until MM19 supplies list authorization', async () => {
    const composition = new ServerComposition({ environment: completeEnvironment })
    const context = {
      principal: {
        kind: 'user' as const,
        uid: 'user-1',
        email: 'user@example.test',
        emailVerified: true
      },
      requestId: 'request-1',
      now: new Date('2026-08-02T12:00:00.000Z')
    }

    await expect(
      composition.getGroceryCommandService().add(context, 'list-1', {
        name: 'Milk',
        category: 'Dairy'
      })
    ).rejects.toEqual(expect.objectContaining({ code: 'not_configured' }))
  })

  it('keeps RDS grocery reads disabled by default', () => {
    const composition = new ServerComposition({ environment: completeEnvironment })

    expect(() => composition.getGroceryReadService()).toThrow(
      expect.objectContaining({ code: 'not_configured' })
    )
    expect(mockGetPrismaClient).not.toHaveBeenCalled()
  })

  it('constructs and caches RDS grocery reads only when explicitly enabled', () => {
    const environment = {
      ...completeEnvironment,
      DATABASE_URL: 'postgresql://user:password@db.example.test/fridge?schema=public',
      RDS_ENABLED: 'true',
      RDS_GROCERY_READS_ENABLED: 'true'
    }
    const composition = new ServerComposition({ environment })

    const first = composition.getGroceryReadService()
    const second = composition.getGroceryReadService()

    expect(second).toBe(first)
    expect(mockGetPrismaClient).toHaveBeenCalledTimes(1)
    expect(mockGetPrismaClient).toHaveBeenCalledWith(environment)
  })

  it('reports client-safe data capabilities without exposing provider configuration', () => {
    const composition = new ServerComposition({
      environment: {
        ...completeEnvironment,
        DATABASE_URL: 'postgresql://user:secret@db.example.test/fridge?schema=public',
        RDS_ENABLED: 'true',
        RDS_GROCERY_READS_ENABLED: 'true'
      }
    })

    expect(composition.getDataCapabilities()).toEqual({
      groceries: { reads: 'rds', writes: 'firebase' }
    })
    expect(JSON.stringify(composition.getDataCapabilities())).not.toContain(
      'db.example.test'
    )
  })

  it('keeps data capabilities on Firebase unless the full RDS read gate is enabled', () => {
    const composition = new ServerComposition({
      environment: {
        ...completeEnvironment,
        RDS_ENABLED: 'true',
        RDS_GROCERY_READS_ENABLED: 'false'
      }
    })

    expect(composition.getDataCapabilities()).toEqual({
      groceries: { reads: 'firebase', writes: 'firebase' }
    })
  })

  it('fails RDS grocery reads closed when enabled without DATABASE_URL', () => {
    mockGetPrismaClient.mockImplementation(() => {
      throw Object.assign(new Error('DATABASE_URL missing'), {
        code: 'not_configured'
      })
    })
    const composition = new ServerComposition({
      environment: {
        ...completeEnvironment,
        RDS_ENABLED: 'true',
        RDS_GROCERY_READS_ENABLED: 'true'
      }
    })

    expect(() => composition.getGroceryReadService()).toThrow(
      expect.objectContaining({ code: 'not_configured' })
    )
  })

  it('keeps RDS grocery reads disabled when the master RDS flag is off', () => {
    const composition = new ServerComposition({
      environment: {
        ...completeEnvironment,
        DATABASE_URL: 'postgresql://user:password@db.example.test/fridge?schema=public',
        RDS_GROCERY_READS_ENABLED: 'true'
      }
    })

    expect(() => composition.getGroceryReadService()).toThrow(
      expect.objectContaining({ code: 'not_configured' })
    )
    expect(mockGetPrismaClient).not.toHaveBeenCalled()
  })

  it('constructs and caches releases and observability services', () => {
    const composition = new ServerComposition({ environment: completeEnvironment })

    expect(composition.getReleasesService()).toBe(
      composition.getReleasesService()
    )
    expect(composition.getRecordClientEventService()).toBe(
      composition.getRecordClientEventService()
    )
  })

  it('constructs and caches categorization and feedback services', () => {
    const composition = new ServerComposition({ environment: completeEnvironment })

    expect(composition.getCategorizeItemService()).toBe(
      composition.getCategorizeItemService()
    )
    expect(composition.getSubmitFeedbackService()).toBe(
      composition.getSubmitFeedbackService()
    )
  })

  it('defers optional releases configuration failure until service execution', async () => {
    const composition = new ServerComposition({
      environment: { ...completeEnvironment, GITHUB_RELEASES_TOKEN: undefined }
    })
    const context = {
      principal: {
        kind: 'user' as const,
        uid: 'user-1',
        email: null,
        emailVerified: false
      },
      requestId: 'request-1',
      now: new Date('2026-08-02T12:00:00.000Z')
    }

    await expect(
      composition.getReleasesService().execute(context)
    ).rejects.toEqual(expect.objectContaining({ code: 'unavailable' }))
  })

  it('injects request IDs and clocks into machine request contexts', () => {
    const now = new Date('2026-08-02T12:00:00.000Z')
    const composition = new ServerComposition({
      environment: completeEnvironment,
      generateRequestId: () => 'composition-request-id',
      now: () => now
    })
    const headers = new Headers({ 'x-n8n-secret': 'a-long-test-secret' })

    const context = composition
      .getN8nGroceryWriteDependencies()
      .authenticateRequest(headers)

    expect(context.requestId).toBe('composition-request-id')
    expect(context.now).toBe(now)
    expect(context.principal.allowedListIds).toEqual(new Set(['household-list']))
  })

  it.each([
    'N8N_WRITE_SECRET',
    'N8N_ALLOWED_LIST_ID',
    'FIREBASE_DATABASE_URL',
    'FIREBASE_SERVICE_ACCOUNT_JSON'
  ] as const)('fails closed when %s is missing', (missingKey) => {
    const environment = { ...completeEnvironment, [missingKey]: undefined }
    const composition = new ServerComposition({ environment })

    expect(() => composition.getN8nGroceryWriteDependencies()).toThrow(
      expect.objectContaining({ code: 'not_configured' })
    )
  })

  it.each([
    ['CATEGORIZE_ITEM_WEBHOOK_URL', (composition: ServerComposition) => composition.getCategorizeItemService()],
    ['SUBMIT_FEEDBACK_WEBHOOK_URL', (composition: ServerComposition) => composition.getSubmitFeedbackService()],
    ['RECEIPT_SCAN_URL', (composition: ServerComposition) => composition.getScanReceiptFileService()],
    ['RECEIPT_URL_SCAN_ENDPOINT', (composition: ServerComposition) => composition.getScanReceiptUrlService()]
  ] as const)('fails closed when %s is missing', (missingKey, construct) => {
    const environment = { ...completeEnvironment, [missingKey]: undefined }
    const composition = new ServerComposition({ environment })

    expect(() => construct(composition)).toThrow(
      expect.objectContaining({ code: 'not_configured' })
    )
  })

  it('rejects malformed provider configuration without exposing its value', () => {
    const secretValue = 'not-json-super-secret'
    const composition = new ServerComposition({
      environment: {
        ...completeEnvironment,
        FIREBASE_SERVICE_ACCOUNT_JSON: secretValue
      }
    })

    let thrown: unknown
    try {
      composition.getN8nGroceryWriteDependencies()
    } catch (error) {
      thrown = error
    }

    expect(thrown).toEqual(
      expect.objectContaining({ code: 'not_configured' })
    )
    expect(String(thrown)).not.toContain(secretValue)
  })

  it.each([
    'http://example.test',
    'https://user:password@example.test',
    'https://example.test/not-the-root',
    'https://example.test/?secret=query'
  ])('rejects an unsafe Firebase database URL: %s', (databaseUrl) => {
    const composition = new ServerComposition({
      environment: { ...completeEnvironment, FIREBASE_DATABASE_URL: databaseUrl }
    })

    expect(() => composition.getN8nGroceryWriteDependencies()).toThrow(
      expect.objectContaining({ code: 'not_configured' })
    )
  })
})

import type { RequestContext } from '../../shared'
import { CategorizeItemService, MAX_CATEGORIZATION_TEXT_LENGTH } from './categorizeItem.service'
import type { CategorizationProvider } from './categorizationProvider'

const context: RequestContext = {
  principal: { kind: 'user', uid: 'user-1', email: null, emailVerified: false },
  requestId: 'request-1',
  now: new Date('2026-08-02T10:00:00.000Z')
}

describe('CategorizeItemService', () => {
  it('trims compatible input and returns the provider item shape', async () => {
    const result = { items: [{ item: 'חלב', category: 'מוצרי חלב' }] }
    const provider: jest.Mocked<CategorizationProvider> = {
      categorize: jest.fn().mockResolvedValue(result)
    }

    await expect(new CategorizeItemService(provider).execute(context, { text: '  חלב  ' })).resolves.toEqual(result)
    expect(provider.categorize).toHaveBeenCalledWith('חלב')
  })

  it.each([
    ['empty text', { text: '   ' }],
    ['missing text', {}],
    ['malformed input', ['milk']],
    ['oversized text', { text: 'x'.repeat(MAX_CATEGORIZATION_TEXT_LENGTH + 1) }]
  ])('rejects %s without provider work', async (_case, input) => {
    const provider: jest.Mocked<CategorizationProvider> = { categorize: jest.fn() }

    await expect(new CategorizeItemService(provider).execute(context, input)).rejects.toEqual(
      expect.objectContaining({ code: 'invalid_input' })
    )
    expect(provider.categorize).not.toHaveBeenCalled()
  })
})

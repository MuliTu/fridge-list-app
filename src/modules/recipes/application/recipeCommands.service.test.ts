import { RecipeCommandService } from './recipeCommands.service'
import type { RequestContext } from '../../shared'

const context: RequestContext = {
  principal: { kind: 'user', uid: 'u', email: null, emailVerified: true },
  now: new Date(), requestId: 'test'
}
it('rejects missing operation identity as a safe input error before persistence', async () => {
  const insert = jest.fn()
  const assertAccessible = jest.fn()
  await expect(new RecipeCommandService({ insert }, { assertAccessible }).save(context, {}))
    .rejects.toMatchObject({ code: 'invalid_input' })
  expect(insert).not.toHaveBeenCalled()
})

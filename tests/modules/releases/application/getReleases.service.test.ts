import type { RequestContext } from '../../../../src/modules/shared'
import { GetReleasesService } from '../../../../src/modules/releases/application/getReleases.service'
import type { ReleaseRepository } from '../../../../src/modules/releases/application/releaseRepository'

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

describe('GetReleasesService', () => {
  it('returns releases through its transport-neutral repository port', async () => {
    const expected = [
      { tag_name: 'v2.40.0', name: 'Current', published_at: '2026-08-01T00:00:00Z', body: 'Notes' }
    ]
    const repository: jest.Mocked<ReleaseRepository> = { getReleases: jest.fn().mockResolvedValue(expected) }

    await expect(new GetReleasesService(repository).execute(context)).resolves.toEqual(expected)
    expect(repository.getReleases).toHaveBeenCalledTimes(1)
  })
})

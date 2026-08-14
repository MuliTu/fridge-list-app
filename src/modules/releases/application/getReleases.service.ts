import type { RequestContext } from '../../shared'
import type { Release, ReleaseRepository } from './releaseRepository'

export class GetReleasesService {
  constructor(private readonly releases: ReleaseRepository) {}

  async execute(_context: RequestContext): Promise<readonly Release[]> {
    return this.releases.getReleases()
  }
}

import '@tanstack/react-start/server-only'

import { ApplicationError } from '../../shared'
import type { Release, ReleaseRepository } from '../application/releaseRepository'

export const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/MuliTu/fridge-list-app/releases?per_page=100'

type Fetch = typeof fetch

type GitHubRelease = {
  tag_name?: unknown
  name?: unknown
  published_at?: unknown
  body?: unknown
}

export class GitHubReleaseRepository implements ReleaseRepository {
  constructor(
    private readonly token: string | undefined,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async getReleases(): Promise<readonly Release[]> {
    if (!this.token?.trim()) {
      throw new ApplicationError('unavailable', 'GitHub releases token is not configured')
    }

    let response: Response
    try {
      response = await this.fetchImpl(GITHUB_RELEASES_URL, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      })
    } catch (error) {
      throw new ApplicationError('upstream_failed', 'GitHub releases request failed', error)
    }

    if (!response.ok) {
      throw new ApplicationError(
        'upstream_failed',
        `GitHub releases request returned HTTP ${response.status}`
      )
    }

    let data: unknown
    try {
      data = await response.json()
    } catch (error) {
      throw new ApplicationError('upstream_failed', 'GitHub releases response was invalid', error)
    }
    if (!Array.isArray(data)) {
      throw new ApplicationError('upstream_failed', 'GitHub releases response was not an array')
    }

    return data.map((value): Release => {
      const release = value as GitHubRelease
      return {
        tag_name: typeof release.tag_name === 'string' ? release.tag_name : '',
        name: typeof release.name === 'string' ? release.name : '',
        published_at: typeof release.published_at === 'string' ? release.published_at : '',
        body: typeof release.body === 'string' ? release.body : ''
      }
    })
  }
}

/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { GITHUB_RELEASES_URL, GitHubReleaseRepository } from './githubReleaseRepository.server'

describe('GitHubReleaseRepository', () => {
  it('preserves the GitHub URL, headers, and normalized response shape', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      Response.json([
        {
          tag_name: 'v2.40.0',
          name: 'Current',
          published_at: '2026-08-01T00:00:00Z',
          body: null,
          ignored: 'provider-only field'
        }
      ])
    )

    const releases = await new GitHubReleaseRepository('github-token', fetchMock).getReleases()

    expect(fetchMock).toHaveBeenCalledWith(GITHUB_RELEASES_URL, {
      headers: {
        Authorization: 'Bearer github-token',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })
    expect(releases).toEqual([
      { tag_name: 'v2.40.0', name: 'Current', published_at: '2026-08-01T00:00:00Z', body: '' }
    ])
  })

  it('preserves the existing 503 behavior when the token is missing', async () => {
    const fetchMock = jest.fn()

    await expect(new GitHubReleaseRepository(undefined, fetchMock).getReleases()).rejects.toEqual(
      expect.objectContaining({ code: 'unavailable' })
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['network failure', jest.fn().mockRejectedValue(new Error('socket secret'))],
    ['non-success response', jest.fn().mockResolvedValue(new Response('provider secret', { status: 403 }))],
    ['invalid response', jest.fn().mockResolvedValue(new Response('not-json'))]
  ])('maps %s to a safe upstream failure', async (_case, fetchMock) => {
    await expect(new GitHubReleaseRepository('github-token', fetchMock).getReleases()).rejects.toEqual(
      expect.objectContaining({ code: 'upstream_failed' })
    )
  })
})

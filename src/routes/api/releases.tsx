import { createFileRoute } from '@tanstack/react-router'
import { logger } from '../../lib/logger'
import { verifyAuthToken } from '../../lib/verifyAuthToken'

const GITHUB_REPO = 'MuliTu/fridge-list-app'
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100`

export const Route = createFileRoute('/api/releases')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authResult = await verifyAuthToken(request)
        if (!authResult.ok) {
          logger.warn(`[releases] request rejected: unauthorized (${authResult.reason})`)
          return Response.json({ error: true, message: 'unauthorized' }, { status: 401 })
        }

        // Fine-grained GitHub PAT (repo, read-only "Contents"/"Metadata" scope) — this
        // repo is private, so the Releases API 404s for unauthenticated requests. Same
        // "fails soft until provisioned" pattern as send-invite-email.tsx's SMTP vars:
        // not something this codebase can generate on its own.
        const token = process.env.GITHUB_RELEASES_TOKEN
        if (!token) {
          logger.error('[releases] GITHUB_RELEASES_TOKEN is not configured — cannot fetch releases')
          return Response.json({ error: true, message: 'not_configured' }, { status: 503 })
        }

        try {
          const upstream = await fetch(GITHUB_RELEASES_URL, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28'
            }
          })
          if (!upstream.ok) {
            logger.error(`[releases] GitHub API responded ${upstream.status}`)
            return Response.json({ error: true, message: 'github_api_failed' }, { status: 502 })
          }
          const data: any[] = await upstream.json()
          const releases = data.map((r) => ({
            tag_name: r.tag_name,
            name: r.name,
            published_at: r.published_at,
            body: r.body || ''
          }))
          logger.success(`[releases] fetched ${releases.length} releases from GitHub`)
          return Response.json({ releases })
        } catch (err: any) {
          logger.error(`[releases] upstream call failed: ${err.message}`)
          return Response.json({ error: true, message: 'releases_fetch_failed' }, { status: 502 })
        }
      }
    }
  }
})

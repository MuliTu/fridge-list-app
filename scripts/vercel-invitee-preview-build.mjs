import { cp, mkdir, rm, writeFile } from 'node:fs/promises'

const source = '.vercel/invitee-preview-static'
const output = '.vercel/output'

await rm(output, { recursive: true, force: true })
await mkdir(`${output}/static`, { recursive: true })
await cp(source, `${output}/static`, { recursive: true })
await writeFile(
  `${output}/config.json`,
  JSON.stringify({
    version: 3,
    routes: [
      {
        src: '/(.*)',
        headers: {
          'X-Frame-Options': 'DENY',
          'Content-Security-Policy': "frame-ancestors 'none'",
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin'
        },
        continue: true
      },
      { src: '/', dest: '/invitee.html' },
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/invitee.html' }
    ]
  }, null, 2)
)

console.log('vercel-invitee-preview-build: wrote isolated static Build Output API bundle')

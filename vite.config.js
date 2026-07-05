import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })

const callServerlessHandler = async (modulePath, req, res) => {
  const body = await readJsonBody(req)
  const { default: handler } = await import(modulePath)
  await handler(
    { method: req.method, body },
    {
      status(code) {
        res.statusCode = code
        return this
      },
      json(obj) {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(obj))
      }
    }
  )
}

// Dev-only stand-ins for the /api Vercel serverless functions — runs the exact same
// handler code locally (in Vite's own Node process), so the n8n webhook URLs never
// reach the browser even in local dev, same as production.
const devApiPlugin = () => ({
  name: 'dev-api-stand-ins',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.method !== 'POST' || !req.url) return next()
      if (req.url === '/api/scan-receipt') return callServerlessHandler('./api/scan-receipt.js', req, res)
      if (req.url === '/api/scan-receipt-url') return callServerlessHandler('./api/scan-receipt-url.js', req, res)
      next()
    })
  }
})

export default defineConfig({
  plugins: [react(), devApiPlugin()],
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5173
  }
})

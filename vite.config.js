import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    proxy: {
      // Dev-only stand-in for the /api/scan-receipt Vercel serverless function —
      // keeps the n8n webhook URL out of the browser even in local dev, since this
      // proxying happens in Vite's own Node process, not client-side.
      '/api/scan-receipt': {
        target: 'https://whiny-idealist-unseen.ngrok-free.dev',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/scan-receipt/, '/webhook/receipt-scan')
      }
    }
  }
})

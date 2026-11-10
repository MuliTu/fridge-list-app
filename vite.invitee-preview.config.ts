import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Isolated, opt-in build for a protected Vercel preview. The normal application
// build never references invitee.html, so this cannot add a production route.
export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    outDir: '.vercel/invitee-preview-static',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'invitee.html')
    }
  }
})

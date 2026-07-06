import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  plugins: [tanstackStart(), tailwindcss(), react()],
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5173
  }
})

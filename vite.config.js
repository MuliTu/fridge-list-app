import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  plugins: [tanstackStart(), react()],
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5173
  }
})

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // En local, /api va al backend (npm run dev:back). En Vercel lo reenvía
  // vercel.json, así que el frontend siempre usa rutas relativas /api/...
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})

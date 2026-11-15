import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // @/ apunta a src. Lo usan los componentes de shadcn (components.json) y
    // vale también en Vitest, que lee esta misma configuración. tsconfig.app.json
    // declara el mismo alias para el editor y para tsc.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
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

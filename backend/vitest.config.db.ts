import { defineConfig } from 'vitest/config'

// Tests contra PostgreSQL (requieren la base levantada con docker compose).
export default defineConfig({
  test: {
    globals: true,
    root: './',
    // Secreto solo para los tests; el real viene del entorno.
    env: { JWT_SECRET: 'secreto-de-prueba-solo-para-tests-0000' },
    include: ['**/*.db-spec.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
  },
})

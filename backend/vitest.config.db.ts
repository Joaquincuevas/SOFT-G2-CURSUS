import { defineConfig } from 'vitest/config'

// Tests contra PostgreSQL (requieren la base levantada con docker compose).
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.db-spec.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
  },
})

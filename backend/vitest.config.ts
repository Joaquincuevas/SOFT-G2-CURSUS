import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    root: './',
    // Secreto solo para los tests; el real viene del entorno.
    env: { JWT_SECRET: 'secreto-de-prueba-solo-para-tests-0000' },
    include: ['**/*.spec.ts'],
  },
})

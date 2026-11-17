import { defineConfig } from 'vitest/config'

// Cobertura del backend (npm run test:cov --workspace=backend). Corre todos sus
// tests juntos, unitarios, end-to-end y de base de datos, porque gran parte de
// la lógica se prueba contra PostgreSQL: necesita la base levantada con docker
// compose. Corre los archivos de a uno, como test:db, porque comparten la base.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    // Secreto solo para los tests; el real viene del entorno.
    env: { JWT_SECRET: 'secreto-de-prueba-solo-para-tests-0000' },
    include: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/*.db-spec.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        // Puntos de entrada que corren como procesos aparte (la API y los
        // comandos de npm run seed y superadmin): la cobertura no los ve. Su
        // lógica está en módulos que sí se miden (seed.ts, crear-superadmin.ts).
        'src/main.ts',
        'src/database/ejecutar-*.ts',
      ],
      reporter: ['text', 'text-summary', 'json-summary', 'html'],
      thresholds: { lines: 95, statements: 95 },
    },
  },
})

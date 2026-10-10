# backend

API de CURSUS: **NestJS + TypeScript + Node.js** (ESM), sobre PostgreSQL (con Row-Level Security por universidad) y Amazon S3 para archivos.

## Scripts

Desde la raíz del repo (`npm run <script> --workspace=backend`) o dentro de `backend/`:

| Script               | Qué hace                                        |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Servidor con recarga en http://localhost:3000   |
| `npm run build`      | Compila a `dist/`                               |
| `npm run start:prod` | Ejecuta el build (`node dist/main`)             |
| `npm run lint`       | ESLint con reglas que usan los tipos            |
| `npm run test`       | Tests unitarios con Vitest (`src/**/*.spec.ts`) |
| `npm run test:e2e`   | Tests end-to-end (`test/**/*.e2e-spec.ts`)      |

El puerto se puede cambiar con la variable de entorno `PORT`.

El proyecto es ESM (`"type": "module"`): los imports relativos llevan extensión `.js` (por ejemplo, `import { AppService } from './app.service.js'`).

# backend

API de CURSUS: **NestJS + TypeScript + Node.js** (ESM), sobre PostgreSQL (con Row-Level Security por universidad) y Amazon S3 para archivos.

## Scripts

Desde la raíz del repo (`npm run <script> --workspace=backend`) o dentro de `backend/`:

| Script                     | Qué hace                                                    |
| -------------------------- | ----------------------------------------------------------- |
| `npm run dev`              | Servidor con recarga en http://localhost:3000               |
| `npm run build`            | Compila a `dist/`                                           |
| `npm run start:prod`       | Ejecuta el build (`node dist/main`)                         |
| `npm run lint`             | ESLint con reglas que usan los tipos                        |
| `npm run test`             | Tests unitarios con Vitest (`src/**/*.spec.ts`)             |
| `npm run test:e2e`         | Tests end-to-end (`test/**/*.e2e-spec.ts`)                  |
| `npm run test:db`          | Tests del schema contra PostgreSQL (`test/**/*.db-spec.ts`) |
| `npm run migration:run`    | Aplica las migraciones pendientes                           |
| `npm run migration:revert` | Revierte la última migración aplicada                       |
| `npm run migration:show`   | Lista las migraciones y cuáles están aplicadas              |

El puerto se puede cambiar con la variable de entorno `PORT`.

## Base de datos

- La conexión está en `src/database/data-source.ts`. Lee las variables `POSTGRES_*` del `.env` de la raíz del repo, o del entorno si no hay `.env` (por ejemplo, en el CI).
- Las migraciones viven en `src/database/migrations/` y se registran a mano en la lista `migrations` de `data-source.ts`.
- Convención de nombres: tablas en singular y en snake_case (`universidad`, `periodo`), columnas en snake_case (`universidad_id`, `created_at`) y restricciones con prefijo `pk_`, `fk_`, `uq_`, `ck_` o `ux_` (índice único).

El proyecto es ESM (`"type": "module"`): los imports relativos llevan extensión `.js` (por ejemplo, `import { AppService } from './app.service.js'`).

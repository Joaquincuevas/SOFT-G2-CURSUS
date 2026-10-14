# backend

API de CURSUS: **NestJS + TypeScript + Node.js** (ESM), sobre PostgreSQL (con Row-Level Security por universidad) y Amazon S3 para archivos.

## Scripts

Desde la raíz del repo (`npm run <script> --workspace=backend`) o dentro de `backend/`:

| Script                       | Qué hace                                                    |
| ---------------------------- | ----------------------------------------------------------- |
| `npm run dev`                | Servidor con recarga en http://localhost:3000/api           |
| `npm run build`              | Compila a `dist/`                                           |
| `npm run start:prod`         | Ejecuta el build (`node dist/main`)                         |
| `npm run lint`               | ESLint con reglas que usan los tipos                        |
| `npm run test`               | Tests unitarios con Vitest (`src/**/*.spec.ts`)             |
| `npm run test:e2e`           | Tests end-to-end (`test/**/*.e2e-spec.ts`)                  |
| `npm run test:db`            | Tests del schema contra PostgreSQL (`test/**/*.db-spec.ts`) |
| `npm run migration:run`      | Aplica las migraciones pendientes                           |
| `npm run migration:revert`   | Revierte la última migración aplicada                       |
| `npm run migration:show`     | Lista las migraciones y cuáles están aplicadas              |
| `npm run migration:run:prod` | Aplica las migraciones desde `dist/` (imagen Docker)        |

El puerto se puede cambiar con la variable de entorno `PORT`.

## API

- Todas las rutas van bajo el prefijo `/api` (por ejemplo, `http://localhost:3000/api`), igual en local, staging y producción. Se configura en `src/config/configurar-app.ts`.
- `GET /api/health`: `200 {"status":"ok"}` si el proceso está vivo. No consulta la base; lo usa el health check del contenedor.
- `GET /api/health/db`: `200` si la base responde y `503` si no. Lo usa la verificación del deploy.
- Si `ORIGIN_SECRET` está definido, toda petición sin el header `x-origin-secret` correcto recibe `403` (salvo `/api/health`). En local va vacío y la validación se desactiva.
- Todas las respuestas llevan `Cache-Control: no-store`.

## Variables de entorno

Con `NODE_ENV=production` (la imagen Docker), la API no arranca si falta `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` u `ORIGIN_SECRET`, y las migraciones no corren si falta alguna de las `POSTGRES_*`. En local se usan los valores por defecto. `POSTGRES_SSL=true` activa SSL hacia la base (RDS). Ver `.env.example`.

## Base de datos

- La conexión está en `src/database/data-source.ts`. Lee las variables `POSTGRES_*` del `.env` de la raíz del repo, o del entorno si no hay `.env` (por ejemplo, en el CI).
- Las migraciones viven en `src/database/migrations/` y se registran a mano en la lista `migrations` de `data-source.ts`.
- Convención de nombres: tablas en singular y en snake_case (`universidad`, `periodo`), columnas en snake_case (`universidad_id`, `created_at`) y restricciones con prefijo `pk_`, `fk_`, `uq_`, `ck_`, `ux_` (índice único) o `ix_` (índice).

El proyecto es ESM (`"type": "module"`): los imports relativos llevan extensión `.js` (por ejemplo, `import { AppService } from './app.service.js'`).

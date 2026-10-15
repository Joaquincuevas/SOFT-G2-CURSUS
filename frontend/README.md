# frontend

Aplicación web de CURSUS: **React + Vite + TypeScript**, con **React Router v7** (`react-router`, modo declarativo) para la navegación.

## Scripts

Desde la raíz del repo (`npm run <script> --workspace=frontend`) o dentro de `frontend/`:

| Script            | Qué hace                                        |
| ----------------- | ----------------------------------------------- |
| `npm run dev`     | Servidor de desarrollo en http://localhost:5173 |
| `npm run build`   | Type-check (`tsc -b`) y build de producción     |
| `npm run lint`    | ESLint                                          |
| `npm run test`    | Vitest + React Testing Library (jsdom)          |
| `npm run preview` | Sirve el build de producción                    |

## Llamadas a la API

El frontend llama siempre a rutas relativas `/api/...` (por ejemplo, `fetch('/api/health')`), nunca a la URL de AWS ni a variables `VITE_` con secretos.

- **Local:** el proxy de Vite (`vite.config.ts`) reenvía `/api` al backend en `http://localhost:3000`. Levanta el backend con `npm run dev:back`.
- **Vercel:** `vercel.json` reenvía `/api/*` a la API de staging y agrega el header secreto `x-origin-secret`, que la API exige. Los valores salen de las variables `API_URL` y `ORIGIN_SECRET` del proyecto en Vercel (entorno Preview, rama `develop`); nunca se escriben en el código. El resto de las rutas sirve `index.html`, para que React Router funcione al recargar.

## Tests

- Los tests van junto al código como `*.test.tsx`.
- `src/test/setup.ts` carga los matchers de `@testing-library/jest-dom` (`toBeInTheDocument`, etc.).
- Las funciones de Vitest se importan explícitamente (`import { test, expect } from 'vitest'`).

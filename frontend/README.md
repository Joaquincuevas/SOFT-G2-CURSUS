# frontend

Aplicación web de CURSUS: **React + Vite + TypeScript**.

## Scripts

Desde la raíz del repo (`npm run <script> --workspace=frontend`) o dentro de `frontend/`:

| Script            | Qué hace                                        |
| ----------------- | ----------------------------------------------- |
| `npm run dev`     | Servidor de desarrollo en http://localhost:5173 |
| `npm run build`   | Type-check (`tsc -b`) y build de producción     |
| `npm run lint`    | ESLint                                          |
| `npm run test`    | Vitest + React Testing Library (jsdom)          |
| `npm run preview` | Sirve el build de producción                    |

## Tests

- Los tests van junto al código como `*.test.tsx`.
- `src/test/setup.ts` carga los matchers de `@testing-library/jest-dom` (`toBeInTheDocument`, etc.).
- Las funciones de Vitest se importan explícitamente (`import { test, expect } from 'vitest'`).

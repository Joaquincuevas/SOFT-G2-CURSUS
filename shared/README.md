# shared

DTOs, tipos e interfaces TypeScript compartidos entre `frontend` y `backend`.

- Se importa como `@cursus/shared` desde los otros workspaces.
- Es un paquete ESM que se compila a `dist/` con `tsc` (`npm run build --workspace=shared`).
- Se compila solo al hacer `npm install` en la raíz. Si cambias `src/`, vuelve a compilarlo para que los demás workspaces vean los cambios.
- Exporta todo desde `src/index.ts`. Los imports relativos llevan extensión `.js`.

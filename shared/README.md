# shared

DTOs, tipos e interfaces TypeScript compartidos entre `frontend` y `backend`.

- Se importa como `@cursus/shared` desde los otros workspaces.
- Es un paquete ESM que se compila a `dist/` con `tsc` (`npm run build --workspace=shared`).
- Se compila solo al hacer `npm install` en la raíz. Si cambias `src/`, vuelve a compilarlo para que los demás workspaces vean los cambios.
- Exporta todo desde `src/index.ts`. Los imports relativos llevan extensión `.js`.

## Permisos (CASL)

`src/permisos.ts` define qué puede hacer cada rol con [`@casl/ability`](https://casl.js.org). `definirAbilityPara(usuario)` devuelve la ability del usuario. El backend la usa en `PermisosGuard` y el frontend la usará para el menú y las rutas (AUTH-06).

| Sujeto      | DIRECTOR | ADMINISTRATIVO       | PROFESOR | AYUDANTE | ALUMNO |
| ----------- | -------- | -------------------- | -------- | -------- | ------ |
| Universidad | read     | read                 | read     | read     | read   |
| Facultad    | read     | read                 | read     | read     | read   |
| Carrera     | read     | manage               | read     | read     | read   |
| Periodo     | read     | manage               | read     | read     | read   |
| Usuario     | read     | create, read, update | —        | —        | —      |

- El Director solo lee (ADR 0001), igual que en la RLS de MT-02.
- Los usuarios no se borran: se archivan con `archived_at`, así que nadie tiene `delete` sobre `Usuario`.
- Todavía no hay condiciones por universidad: llegan con MT-01.
- Si cambias la matriz, actualiza también `backend/src/auth/permisos.spec.ts`.

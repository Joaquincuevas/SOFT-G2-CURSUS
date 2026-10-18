# shared

DTOs, tipos e interfaces TypeScript compartidos entre `frontend` y `backend`.

- Se importa como `@cursus/shared` desde los otros workspaces.
- Es un paquete ESM que se compila a `dist/` con `tsc` (`npm run build --workspace=shared`).
- Se compila solo al hacer `npm install` en la raíz. Si cambias `src/`, vuelve a compilarlo para que los demás workspaces vean los cambios.
- Exporta todo desde `src/index.ts`. Los imports relativos llevan extensión `.js`.

## Permisos (CASL)

`src/permisos.ts` define qué puede hacer cada rol con [`@casl/ability`](https://casl.js.org). `definirAbilityPara(usuario)` devuelve la ability del usuario. El backend la usa en `PermisosGuard` y el frontend para el menú, las rutas (`navigation.ts`) y los botones (`usePuede`).

### Sujetos de tabla

Uno por tabla del schema (`Curso` se adelanta a la tabla de GES-*). Deciden qué endpoints puede usar cada rol y qué acciones ve dentro de una página.

| Sujeto      | DIRECTOR | ADMINISTRATIVO       | PROFESOR | AYUDANTE | ALUMNO |
| ----------- | -------- | -------------------- | -------- | -------- | ------ |
| Universidad | read     | read                 | read     | read     | read   |
| Facultad    | read     | read                 | read     | read     | read   |
| Carrera     | read     | manage               | read     | read     | read   |
| Periodo     | read     | manage               | read     | read     | read   |
| Usuario     | read     | create, read, update | —        | —        | —      |
| Curso       | read     | manage               | —        | —        | —      |

### Sujetos de sección

No son tablas: son las secciones del menú del frontend, que dependen del rol y no de los permisos sobre tablas. Solo se usan con `read`.

| Sujeto           | Ruta             | DIRECTOR | ADMINISTRATIVO | PROFESOR | AYUDANTE | ALUMNO |
| ---------------- | ---------------- | -------- | -------------- | -------- | -------- | ------ |
| PanelDirectorio  | `/universidades` | read     | —              | —        | —        | —      |
| GestionAcademica | `/cursos`        | read     | read           | —        | —        | —      |
| MisCursos        | `/mis-cursos`    | —        | —              | read     | read     | read   |

- El Director solo lee (ADR 0001), igual que en la RLS de MT-02.
- Los usuarios no se borran: se archivan con `archived_at`, así que nadie tiene `delete` sobre `Usuario`.
- Todavía no hay condiciones por universidad: llegan con MT-01.
- Si cambias la matriz, actualiza también `backend/src/auth/permisos.spec.ts`.

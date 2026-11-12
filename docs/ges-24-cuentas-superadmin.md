# GES-24: el superadmin crea cuentas de cualquier rol en cualquier universidad

Tarjeta: F4 · GES-24 (https://trello.com/c/Dk2GSgwV). Referencia: feedback de la demo de la E5 (27-10-2026); extiende GES-21. Depende de [MT-04](mt-04-superadmin.md) y [GES-23](ges-23-universidades-facultades.md). La decisión está en el [ADR 0002](adr/0002-superadmin-con-acceso-a-todas-las-universidades.md).

## Comportamiento

Desde **Administrar universidad → Administrar cuentas** (`/superadmin/universidades/:id/cuentas`), el superadmin ve las cuentas vigentes de esa universidad, las busca por nombre o correo, las filtra por rol, y crea, edita o archiva. No necesita elegir una facultad. Cada cambio queda en `superadmin_cambio`, sin `password_hash`.

- **Crear:** nombre, correo institucional y rol (Director, Administrativo, Profesor, Ayudante o Alumno). Otro superadmin solo se crea con el comando de MT-04.
- **Facultad:** solo la elige un Administrativo, y es obligatoria. Debe ser vigente y de esa universidad. Al editar, otro rol conserva la facultad que ya tenía, por ejemplo la de un profesor creado con GES-21, salvo el Director, que queda sin facultad.
- **Correo:** debe ser del dominio de la universidad. Si no, se rechaza con `El correo debe ser @dominio`. Un correo ya registrado no crea otra cuenta, y el de una cuenta archivada sigue ocupado, porque el índice único incluye las archivadas.
- **Contraseña provisoria:** se muestra una sola vez en un diálogo y se descarta al cerrarlo. La cuenta debe cambiarla en su primer ingreso (PER-03).
- **Cambiar el rol:** se rechaza si la persona tiene secciones a cargo, ayudantías o inscripciones activas, porque quedarían a cargo de alguien con otro rol. Hay que quitárselas primero (GES-14 y GES-19). Si se acepta, se cierran sus sesiones, porque el JWT guarda el rol.
- **Archivar:** pide confirmación y no pide motivo. La persona no puede iniciar sesión, sus sesiones abiertas se cortan en la siguiente petición, y deja de aparecer en la lista. Se permite con asignaciones activas, porque cortar el acceso puede ser urgente: sus secciones la siguen mostrando hasta que el Administrativo asigne a otra persona. No se deshace desde la app.

No tiene vista en el Figma: sigue el estilo de Carreras.

## API

Todas las rutas son solo del superadmin y no dependen de la facultad elegida. Piden `create` o `update` sobre `Universidad` y no sobre `Usuario`, que también tiene el Administrativo.

| Ruta                                                                 | Qué hace                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /api/superadmin/universidades/:id/cuentas`                      | `CuentaUniversidad[]`: las cuentas vigentes, por nombre.                        |
| `POST /api/superadmin/universidades/:id/cuentas`                     | Body `GuardarCuenta`. 201 con `CuentaCreada` (`cuenta` y `passwordProvisoria`). |
| `PATCH /api/superadmin/universidades/:id/cuentas/:cuentaId`          | Body `GuardarCuenta` completo. 200 con la cuenta.                               |
| `PATCH /api/superadmin/universidades/:id/cuentas/:cuentaId/archivar` | 204.                                                                            |

- 400: datos inválidos, otro dominio, facultad ausente o que no corresponde, o rol `SUPERADMIN`.
- 401 sin sesión; 403 con otro rol.
- 404: la universidad o la cuenta no existen, están archivadas, o la cuenta es de otra universidad.
- 409: correo ya registrado, o cambio de rol con asignaciones activas.

## Base de datos

No hay migración. Las rutas van bajo la universidad porque la RLS de `usuario` exige fijarla: `BaseDeDatos.enUniversidadComoSuperadmin()` la fija con el rol `ADMINISTRATIVO` y `app.superadmin_id`, igual que cuando el superadmin trabaja en una facultad, pero sin facultad elegida. Por eso se aplican las mismas políticas, y el trigger de MT-04 audita los cambios. La API sigue sin poder crear superadmins: `ck_usuario_superadmin` exige que no tengan universidad.

Las sesiones se revocan con `AuthService.revocarSesiones()`, después del commit, porque `sesion_auth` no es accesible con el rol de la API.

## Cómo probar

```bash
docker compose up -d --wait
npm run migration:run --workspace=backend
npm run seed --workspace=backend
npm run dev:back
npm run dev:front
```

1. Entrar con el superadmin local (ver "Superadmin" en el README). En el Dashboard, **Administrar** Universidad Demo Norte y luego **Administrar cuentas**.
2. Crear un Director con un correo `@otro.cl`: mensaje claro y no se crea.
3. Crearlo con `@norte.cursus.test`: aparece la contraseña una sola vez. En otra ventana privada, entrar con ella: obliga a cambiarla.
4. Crear un Administrativo: pide facultad. Repetir el correo: mensaje de ya registrado.
5. Editar un profesor con secciones del seed y cambiarlo a Alumno: rechazado, con el motivo.
6. Archivar la cuenta del paso 3 con su sesión abierta: la sesión se corta y no vuelve a entrar.
7. Revisar los cambios en `superadmin_cambio`.

Tests:

- `backend/test/superadmin/cuentas.db-spec.ts` (base real): crear cada rol en cada universidad y entrar con la contraseña provisoria, hash y auditoría sin `password_hash`, dominio, correo repetido y archivado, facultad, edición, cambio de rol con cada tipo de asignación, sesiones cortadas, archivar, 404 entre universidades, y 403 a los demás roles.
- `backend/test/superadmin/cuentas.e2e-spec.ts`: 401, 403 por rol y 400 de validación.
- `base-de-datos.service.spec.ts`: `enUniversidadComoSuperadmin`.
- `frontend/src/pages/CuentasUniversidad.test.tsx`: lista y filtros, facultad solo para el Administrativo, contraseña una sola vez, mensajes del 400 y del 409, edición, confirmación de archivar y acceso de otros roles.

## Revisión

1. Revisar `CuentasService`, en especial la regla del cambio de rol y que una cuenta de otra universidad responda 404.
2. Revisar que las rutas pidan permisos sobre `Universidad` y no sobre `Usuario`.
3. Probar en local los pasos de "Cómo probar".
4. Después del merge, en staging: crear el Director y el Administrativo de una universidad de prueba y entrar con ellos.

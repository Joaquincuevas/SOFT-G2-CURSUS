# GES-23: el superadmin gestiona universidades y facultades

Tarjeta: [F4 · GES-23 Superadmin gestiona universidades y facultades](https://trello.com/c/LmzemO8j). Referencia: feedback de la demo de la E5 (27-10-2026). Depende de MT-04 ([guía](mt-04-superadmin.md) y [ADR 0002](adr/0002-superadmin-con-acceso-a-todas-las-universidades.md)).

## Comportamiento

El superadmin crea, edita y archiva universidades y facultades desde su **vista global**, sin elegir una facultad. Nada se borra: archivar marca `archived_at`, y lo archivado deja de aparecer en las listas y conserva sus datos. Cada cambio queda en `superadmin_cambio` (MT-04).

- **Universidad:** nombre, dominio del correo y color (`#rrggbb`). El nombre y el dominio no se repiten, tampoco con una universidad archivada. El nombre se compara sin mayúsculas ni espacios repetidos, como el de una carrera.
- **Dominio:**
  - Solo se cambia mientras la universidad no tiene usuarios. El login identifica la universidad por el dominio del correo, así que cambiarlo dejaría sin acceso a todos sus usuarios.
  - Tampoco puede ser el dominio del correo de un superadmin.
- **Color:** [UI-04](ui-04-tema-universidad.md) inicializa colores distintos en las universidades existentes que conservaban el azul por defecto, aplica el tema por sesión y rechaza colores sin contraste suficiente al crear o editar. Conserva las personalizaciones del superadmin.
- **Archivar una universidad:**
  - Sus usuarios ya no pueden iniciar sesión, y las sesiones abiertas se cortan en la siguiente petición, como las de un usuario archivado.
  - Si un superadmin trabajaba en ella, vuelve a la vista global.
  - No se deshace por la API. Por eso exige un motivo, que queda en `superadmin_cambio`, y la confirmación muestra cuántos usuarios vigentes dejarán de poder iniciar sesión.
- **Facultad:** nombre único dentro de su universidad. Solo se archiva sin carreras, cursos ni usuarios vigentes: si no, responde 409 con cuántos tiene. Los cursos se cuentan aparte de sus carreras, por si una carrera se archivó con cursos vigentes.
- **Dashboard del superadmin:**
  - Muestra las universidades con su color, su dominio y sus facultades.
  - Elegir una facultad lleva a trabajar en ella (MT-04).
  - "Nueva universidad" abre el formulario.
  - "Administrar" lleva a la página de esa universidad.
- **Barra de contexto:** sobre el contenido muestra dónde trabaja, con "Cambiar" y "Salir de la universidad".
- **Vistas del Administrativo sin facultad elegida:** muestran un aviso con un botón al Dashboard, sin redirigir.
- **Administrar universidad** (`/superadmin/universidades/:id`, fuera del menú):
  - Edita los datos.
  - Crea, renombra y archiva facultades. Archivar pide confirmación.
  - Archiva la universidad: la confirmación muestra los usuarios afectados y pide el motivo.

No tiene vista en el Figma: sigue el estilo de Carreras y de las tarjetas del Dashboard.

## API

Todas las rutas son solo del superadmin (`create` o `update` sobre `Universidad` y `Facultad`); al resto, 403. No dependen de la facultad elegida.

| Ruta                                                       | Qué hace                                                                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/superadmin/universidades`                        | `UniversidadElegible[]`: universidades vigentes con `dominioCorreo`, `color` y sus facultades vigentes.                                         |
| `POST /api/superadmin/universidades`                       | Body `CrearUniversidad` (`nombre`, `dominioCorreo`, `color`). 201 con la universidad. 400 si un dato no tiene el formato; 409 con el motivo.    |
| `PATCH /api/superadmin/universidades/:id`                  | Body `EditarUniversidad`: solo lo que cambia (vacío, 400). 409 con el motivo (nombre o dominio repetido, dominio con usuarios). 404 si no está. |
| `GET /api/superadmin/universidades/:id/usuarios-afectados` | `UsuariosAfectados` (`usuarios`): los usuarios vigentes que dejarían de iniciar sesión. 404 si no existe o está archivada.                      |
| `PATCH /api/superadmin/universidades/:id/archivar`         | Body `ArchivarUniversidad` (`motivo`, obligatorio, hasta 500 caracteres; si no, 400). 204. 404 si no existe o ya está archivada.                |
| `POST /api/superadmin/universidades/:id/facultades`        | Body `{ nombre }`. 201 con la facultad. 404 si la universidad no está; 409 si el nombre se repite en ella.                                      |
| `PATCH /api/superadmin/facultades/:id`                     | Body `{ nombre }`. 200 con la facultad. 404 si no está; 409 si el nombre se repite.                                                             |
| `PATCH /api/superadmin/facultades/:id/archivar`            | 204. 409 si tiene carreras, cursos o usuarios vigentes; 404 si no está.                                                                         |
| `DELETE /api/superadmin/contexto`                          | Salir de la universidad (MT-04): limpia la elección de la sesión, no borra datos.                                                               |

## Base de datos

Migración `1792680000000-GestionarUniversidades` (compatible hacia atrás). Va después de `1792660000000-CrearNota` (NOT-05) y `1792670000000-CrearHistorialAnuncio` (ANU-05), y al revertir sale antes que ellas:

- `universidad.color`, con el color de CURSUS por defecto y el CHECK `ck_universidad_color`.
- Índices únicos de nombre normalizado: `ux_universidad_nombre_normalizado` y `ux_facultad_universidad_nombre_normalizado`.
- **Escritura solo del superadmin:**
  - La política de INSERT de `universidad` y `facultad` y el `WITH CHECK` de su política de UPDATE exigen `rol_actual() = 'SUPERADMIN'` con `superadmin_actual()`.
  - Antes las tenía cualquier rol salvo el Director dentro de su universidad, aunque ninguna ruta las usaba.
  - El `USING` de UPDATE conserva las filas de antes (las de su universidad, salvo el Director), porque también decide qué filas bloquea un `SELECT ... FOR UPDATE`. GES-02 bloquea la fila de su universidad para activar un período: el Administrativo la sigue bloqueando, pero un `UPDATE` suyo falla.
  - Dentro de una facultad el superadmin trabaja como Administrativo, así que tampoco escribe aquí.
- **Triggers `SECURITY DEFINER`** (la RLS no deja ver usuarios desde la vista global). Responden `restrict_violation` con el motivo:
  - `tg_universidad_dominio` (`validar_dominio_universidad()`): el dominio de una universidad con usuarios no cambia, y no puede ser el de un superadmin.
  - `tg_facultad_archivable` (`facultad_archivable()`): una facultad con carreras, cursos o usuarios vigentes no se archiva.
- **`usuarios_vigentes_universidad(universidad)`** (`SECURITY DEFINER`): cuenta los usuarios vigentes de una universidad vigente (NULL si no existe o está archivada). Responde `insufficient_privilege` a cualquier rol que no sea `SUPERADMIN`.

En el backend, `BaseDeDatos.escribirComoSuperadmin()` fija `app.rol = 'SUPERADMIN'` y `app.superadmin_id` sin universidad. `UniversidadesService` envuelve cada UPDATE en un CTE y traduce las restricciones a 409. Al archivar una universidad fija el motivo con `fijarMotivo()` dentro de la misma transacción. El login, el refresh y `sesionActiva` rechazan a los usuarios de una universidad archivada.

## Cómo probar

```bash
npm run migration:run --workspace=backend
npm run dev:back
npm run dev:front
```

1. Entrar con el superadmin local (ver "Superadmin" en el README).
2. En el Dashboard, crear una universidad, entrar a "Administrar", cambiarle el color y el dominio, y crear, renombrar y archivar una facultad.
3. Intentar cambiar el dominio de Universidad Demo Norte (409) y archivar su Facultad de Ingeniería (409).
4. Archivar la universidad creada: la confirmación muestra los usuarios afectados y no deja seguir sin motivo. Revisar el motivo en `superadmin_cambio`.
5. Con otro rol, entrar a `/superadmin/universidades/<id>`: vuelve a su Dashboard.

Tests:

- `backend/test/gestion/universidades.db-spec.ts` (API y RLS):
  - Crear, validar, editar y archivar universidades y facultades.
  - Nombres y dominios repetidos, el dominio con usuarios y el de un superadmin.
  - El motivo obligatorio al archivar una universidad, su registro en la auditoría y el conteo de usuarios afectados.
  - La facultad en uso (también con cursos vigentes de una carrera archivada), la auditoría y el login de una universidad archivada.
  - Que ningún otro rol escribe, ni por la API ni en la base.
- `backend/test/multitenant/superadmin.db-spec.ts`: salir de la universidad.
- `esquema-inicial.db-spec.ts` (reversión) y `rls.db-spec.ts`.
- Tests unitarios: `base-de-datos.service.spec.ts` (`escribirComoSuperadmin`) y la matriz de `permisos.spec.ts`.
- `frontend/src/pages/PanelSuperadmin.test.tsx`: el Dashboard, el aviso sin facultad, la barra de contexto y la elección.
- `frontend/src/pages/AdministrarUniversidad.test.tsx`: crear una universidad, administrar sus datos y facultades, los motivos de rechazo, archivar con los usuarios afectados y el motivo, y el acceso de otros roles.

## Revisión

1. Revisar la migración: las políticas nuevas de `universidad` y `facultad`, los dos triggers y `usuarios_vigentes_universidad()`.
2. Revisar que el login, el refresh y `sesionActiva` corten a los usuarios de una universidad archivada.
3. Probar en local los pasos de "Cómo probar".
4. Después del merge, en staging: crear una universidad de prueba y archivarla.

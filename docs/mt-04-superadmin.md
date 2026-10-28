# MT-04: superadmin con acceso total a todas las universidades

Tarjeta: [F4 · MT-04 Superadmin con acceso total a todas las universidades](https://trello.com/c/CmgRFMu2). Referencia: feedback de la demo de la E5 (27-10-2026). Depende de MT-02, MT-03 y PER-03. La decisión está en el [ADR 0002](adr/0002-superadmin-con-acceso-a-todas-las-universidades.md).

## Comportamiento

1. Una persona crea el superadmin con un comando (ver "Crear el superadmin"). Tiene una contraseña provisoria.
2. El superadmin inicia sesión con su correo, que no es de ninguna universidad, y debe cambiar la contraseña antes de seguir (PER-03).
3. Llega al Dashboard, que muestra las universidades con sus facultades (la vista global). Elige una facultad y la app pasa a trabajar en ella. Mientras no elija, las demás vistas muestran el aviso "Elige una universidad primero" con un botón al Dashboard, sin redirigir, y la API le responde 403 con "Elige una universidad y una facultad para continuar". Su perfil no depende de la elección.
4. Dentro de la facultad, trabaja con las mismas vistas y rutas del Administrativo: cursos, carreras, períodos, secciones, horarios, profesores, ayudantes y alumnos. En el espacio de una sección entra como Administrativo.
5. Una barra sobre el contenido muestra dónde está trabajando, con "Cambiar" (vuelve al Dashboard, que marca la facultad actual) y "Salir de la universidad" (vuelve a la vista global). La elección vale para esa sesión: otra sesión del mismo superadmin elige la suya. Si la facultad o la universidad elegida se archiva, debe elegir otra.
6. Todo lo que crea o modifica queda en `superadmin_cambio`.

Crear y editar universidades y facultades es [GES-23](ges-23-universidades-facultades.md), que también agrega el Dashboard, la barra de contexto y salir de la universidad. Crear usuarios de cualquier rol es GES-24.

## API

| Ruta                                | Qué hace                                                                                                                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/superadmin/universidades` | `UniversidadElegible[]`: universidades vigentes, cada una con sus facultades vigentes. Solo el superadmin (`read PanelSuperadmin`); al resto, 403.                                                                    |
| `PUT /api/superadmin/contexto`      | Body `{ universidadId, facultadId }` (UUID, si no 400). Guarda la elección en la sesión y responde el `UsuarioSesion` nuevo. 404 si la facultad no es de esa universidad o alguna está archivada. Solo el superadmin. |
| `DELETE /api/superadmin/contexto`   | Salir de la universidad: quita la elección de la sesión (no borra datos) y responde el `UsuarioSesion` de la vista global. Solo el superadmin.                                                                        |
| `GET /api/auth/yo`                  | Para el superadmin: `universidadId` y `facultadNombre` de la elección, o `null` y "CURSUS" mientras no elige.                                                                                                         |
| `PATCH /api/perfil`                 | El superadmin edita su nombre aunque no haya elegido facultad.                                                                                                                                                        |
| Rutas del Administrativo            | Con una facultad elegida, responden igual que al Administrativo de esa facultad. Sin elegir, 403.                                                                                                                     |

En el backend, `contextoDeLaSesion(req)` (`backend/src/auth/universidad-actual.decorator.ts`) resuelve el contexto de `@UniversidadActual()` y de `@IntegranteDeSeccion()`: para el superadmin, la universidad elegida, el rol `ADMINISTRATIVO` y `superadmin: { id, facultadId }`. `BaseDeDatos` fija además `app.superadmin_id` y `app.facultad_id` en la transacción.

## Datos

Cuatro migraciones:

- `1792650000000-AgregarRolSuperadmin`: el valor `SUPERADMIN` de `rol_usuario`, solo, porque un valor nuevo de enum no se usa en la misma transacción.
- `1792651000000-PermitirUsuarioSuperadmin`:
  - `usuario.universidad_id` acepta NULL, solo para el superadmin, y el superadmin no tiene facultad (`ck_usuario_superadmin`). Su correo es único entre los superadmins (`ux_usuario_correo_superadmin`).
  - Nadie ve la fila del superadmin desde la API, tampoco el Director.
  - Las FKs del responsable en `curso_cambio`, `asignacion_cambio` e `inscripcion.archivada_por` referencian solo al usuario. El trigger `responsable_de_la_universidad` mantiene la regla anterior (el responsable es de la universidad del cambio) y acepta a un superadmin. Responde con el mismo código y la misma restricción que la FK.
- `1792652000000-ElegirFacultadSuperadmin`:
  - `sesion_auth.universidad_activa_id` y `facultad_activa_id`, con FK a la facultad de esa universidad.
  - Las funciones `superadmin_actual()` y `facultad_actual(usuario)`. Esta última reemplaza a la subconsulta de facultad que repetían los servicios de gestión.
  - La lectura de `universidad` y `facultad` para el rol `SUPERADMIN`.
- `1792653000000-CrearSuperadminCambio`:
  - La tabla `superadmin_cambio`: universidad, superadmin, tabla, registro, operación (`INSERT` o `UPDATE`), `anterior` y `nuevo` en `jsonb` sin `password_hash`, motivo y fecha.
  - Un trigger `tg_<tabla>_auditar_superadmin` en cada tabla institucional, que corre solo con `app.superadmin_id`. Un UPDATE sin cambios no deja registro.
  - Es de solo adición: la API solo la lee, y solo un superadmin; la escribe el trigger (`SECURITY DEFINER`); y otro trigger impide modificarla o borrarla incluso al dueño de la tabla.
  - El motivo se fija con `fijarMotivo(bd, motivo)` dentro de la transacción. Hoy lo usan las bajas de profesor y ayudante (GES-14).

Las migraciones son compatibles hacia atrás: el código anterior sigue funcionando con la base migrada.

## Crear el superadmin

En local, con las migraciones aplicadas:

```bash
SUPERADMIN_CORREO=superadmin@cursus.test SUPERADMIN_NOMBRE="Superadmin" SUPERADMIN_PASSWORD=<contraseña-provisoria> npm run superadmin --workspace=backend
```

En AWS lo corre una persona desde CloudShell:

1. `bash infra/aws/stack.sh <entorno> --dry-run` y, si solo agrega `SecretoSuperadmin`, actualiza `RolEjecucion` y crea una revisión nueva de `DefinicionTarea`, `bash infra/aws/stack.sh <entorno>`.
2. Con el entorno encendido: `bash infra/aws/superadmin.sh <entorno> <correo> "<nombre>"`.
3. Obtener la contraseña provisoria y entregarla por privado: `aws secretsmanager get-secret-value --secret-id cursus-<entorno>/superadmin-password --query SecretString --output text`.

El comando falla sin cambiar nada si el correo es inválido, ya existe (con cualquier rol) o es del dominio de una universidad, o si la contraseña tiene menos de 8 caracteres. Nunca imprime la contraseña.

## Para las tarjetas siguientes

- Una tabla nueva con `universidad_id` debe tener el trigger `tg_<tabla>_auditar_superadmin` (en su propia migración, con `EXECUTE FUNCTION auditar_superadmin()`). El contrato de `test/multitenant/rls.db-spec.ts` falla si falta.
- Las rutas que usan `@UniversidadActual()` o `@IntegranteDeSeccion()` ya consideran al superadmin. Para buscar la facultad del usuario de la sesión, usa `facultad_actual(<usuario>)` y no `usuario.facultad_id`.
- Si una consulta muestra el nombre de quien hizo un cambio, usa `LEFT JOIN usuario` con "Superadmin" como respaldo: RLS no deja ver su fila.

## Verificación

Desde la raíz, con Node 24.15+, dependencias instaladas y PostgreSQL disponible:

```bash
npm run lint
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
npm run build
```

- `backend/test/multitenant/superadmin.db-spec.ts` (API):
  - Login sin universidad, cambio obligatorio de la contraseña provisoria, lista de universidades, elección (404, 400 y la sesión nueva) y salir de la universidad.
  - Las rutas del Administrativo responden lo mismo que al Administrativo de esa facultad.
  - Crear una carrera queda auditado, y el historial de un curso lo muestra como responsable.
  - Quitar un ayudante guarda el motivo en la auditoría.
  - El espacio de una sección (200, 403 y 404), el cambio de universidad, una facultad archivada y el perfil.
  - Ningún otro rol usa su panel, y el Administrativo de otra universidad o facultad no ve lo que creó.
- `backend/test/multitenant/superadmin-rls.db-spec.ts` (base):
  - La lectura entre universidades y que la API no puede crear ni convertir a un superadmin.
  - Que nadie ve su fila y `facultad_actual()`.
  - La auditoría: valor nuevo, anterior y motivo, sin `password_hash`, sin registro de otros roles ni de un UPDATE sin cambios, solo lectura para el superadmin, y sin modificación ni borrado.
- `backend/test/database/crear-superadmin.db-spec.ts`: el comando y sus validaciones.
- `esquema-inicial.db-spec.ts` (restricciones y reversión de las migraciones) y `rls.db-spec.ts` (contrato de auditoría).
- Tests unitarios: `universidad-actual.decorator.spec.ts`, `base-de-datos.service.spec.ts` y la matriz de `permisos.spec.ts`.
- `frontend/src/pages/PanelSuperadmin.test.tsx`: el Dashboard con las universidades, el aviso de las demás vistas mientras no elige (y el perfil sin aviso), la elección, la barra de contexto con "Cambiar" y "Salir de la universidad", los errores y que otros roles no ven la barra.

## Revisión

1. Revisar las migraciones, en especial la política de `usuario`, el trigger del responsable y la auditoría.
2. Revisar `contextoDeLaSesion` y que el superadmin no reciba nada fuera de la facultad elegida.
3. Probar en local: crear el superadmin, entrar, cambiar la contraseña, elegir Ingeniería de Norte en el Dashboard, crear una carrera y revisar `superadmin_cambio`, cambiar a Salud de Sur y salir de la universidad.
4. Después del merge, en staging: aplicar `stack.sh staging`, crear el superadmin con `superadmin.sh staging` y confirmar que las migraciones corrieron en RDS.

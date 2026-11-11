# GES-25: una sección puede tener varios profesores

Tarjeta: [GES-25](https://trello.com/c/O5fAznBp). Depende de GES-12 (asignar profesor), GES-13 (ayudantes) y GES-14 (quitar con motivo), y toca las tarjetas que exigen "el profesor de la sección": NOT-01/02/10/11/12, ASI-01/02/04/05, ANU-01/05 y MAT-08.

**Como** Administrativo, **quiero** asignar varios profesores a una sección, **para** que todos tengan los mismos permisos sobre ella.

## Criterios

| Criterio                                                                                     | Cómo se cumple                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Se asignan y quitan varios profesores; quitar exige motivo y queda en el historial (GES-14). | `POST /api/secciones/:id/profesores` agrega uno (409 si ya está). `PATCH /api/secciones/:id/profesores/:usuarioId/quitar` exige motivo y registra la baja en `asignacion_cambio`.                                |
| Cada profesor asignado tiene los mismos permisos: notas, asistencia, anuncios y materiales.  | `es_profesor_de_seccion(seccion, usuario)` reemplaza cada `s.profesor_id = X` en la RLS, en el trigger de ASI-04 y en los servicios. `IntegranteSeccionGuard` da el rol `PROFESOR` a cualquier profesor vigente. |
| Las secciones con un profesor lo conservan tras la migración.                                | El backfill copia `seccion.profesor_id` a `seccion_profesor`.                                                                                                                                                    |
| Migración compatible hacia atrás.                                                            | `seccion.profesor_id` se mantiene y se sincroniza en los dos sentidos. Un deploy posterior lo retira (ver **Retiro de `profesor_id`**).                                                                          |

## Comportamiento

En el detalle del curso (Gestión académica), la columna **Profesores** muestra a todos los profesores vigentes de cada sección, separados por coma.

El botón **Profesores** (permiso `update` de `Seccion`) abre un diálogo:

- la lista de profesores asignados, cada uno con **Quitar**; si no hay, "La sección N no tiene profesores asignados.";
- **Quitar** abre la confirmación con **Motivo** obligatorio, **Quitar profesor** y **Cancelar**;
- **Profesor a agregar** ofrece los profesores de la universidad que aún no están asignados, y **Agregar** los suma sin tocar a los demás;
- tras cada cambio aparece un aviso (`role="status"`) y la tabla del curso se actualiza;
- muestra la carga, el error con **Reintentar** y los errores de la API (`role="alert"`). Ante un 404 o un 409 (otro Administrativo ya quitó o agregó a ese profesor), vuelve a pedir la lista. Mientras hay un cambio pendiente todo queda deshabilitado, y se desbloquea siempre en un `finally`.

Reemplaza a **Asignar/Cambiar profesor** y **Quitar profesor**, que solo manejaban un profesor. La vista unificada de la sección es GES-26.

Los dashboards (ESP-01/02/03) y la vista de la sección (ESP-04) muestran a todos los profesores: "Profesor a cargo: X" con uno, y "Profesores a cargo: X, Y" con varios.

## API

| Ruta                                                                 | Respuesta                                                                                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/secciones/:id/profesores`                                  | `ProfesorAsignable[]`: los profesores de la universidad, con `asignado`. 404 si la sección no es de la facultad.                                                   |
| `POST /api/secciones/:id/profesores` `{ profesorId }`                | 200 con los asignados (`ProfesorResumen[]`). 404 si la sección o el profesor no existen (o es de otra universidad, otro rol o archivado). 409 si ya está asignado. |
| `PATCH /api/secciones/:id/profesores/:usuarioId/quitar` `{ motivo }` | 200 `ProfesorQuitado` con los que siguen. 400 sin motivo (o vacío, o de más de 500 caracteres). 404 si no está asignado.                                           |

Las tres exigen `@Puede('update', 'Seccion')` (el Administrativo de la facultad), como GES-13 y GES-14. El ayudante, el profesor, el alumno y el Director reciben 403.

**Endpoints anteriores, que se mantienen:**

- `PUT /api/secciones/:id/profesor` (GES-12): escribe `profesor_id` como antes. El trigger archiva al anterior y agrega al nuevo, sin tocar a los demás profesores.
- `PATCH /api/secciones/:id/profesor/quitar` (GES-14): quita al profesor indicado aunque haya otros. Si ya no está asignado, responde el 409 `ProfesorCambiado` de siempre, con el primer profesor vigente.

**Respuestas con profesores:** `SeccionDetalle`, `SeccionAlumno`, `SeccionAyudante` y `SeccionResumen` agregan `profesores: string[]` (todos los vigentes, por nombre). `profesor` y `profesorId` quedan deprecados hasta el retiro de `profesor_id`.

**Deploys desfasados:** el frontend (Vercel) y el backend se despliegan por separado. Si el frontend nuevo recibe una respuesta sin `profesores` (de un backend anterior):

- muestra el campo deprecado (`nombresProfesores` en `misSecciones.ts`) en vez de fallar;
- el diálogo **Profesores** pasa al modo anterior: pide las opciones a `GET /api/profesores`, agrega con `PUT /api/secciones/:id/profesor` (con un profesor asignado, el botón dice **Reemplazar** y lo avisa) y quita con `PATCH /api/secciones/:id/profesor/quitar`. Así el Administrativo no se queda sin acciones mientras llega el backend nuevo.

Lo cubren tests de `CursoDetalle.test.tsx` y `ProfesoresSeccion.test.tsx`.

## Datos

Migración `1792790000000-VariosProfesoresSeccion`:

- **`seccion_profesor`**, igual que `ayudante_seccion`:
  - FKs compuestas `(seccion_id, universidad_id)` y `(usuario_id, universidad_id)`;
  - `archived_at`, y `ux_seccion_profesor_activo` único por `(seccion_id, usuario_id)` `WHERE archived_at IS NULL`;
  - RLS con `ENABLE`: leen la universidad y el Director, escribe el Administrativo de su universidad;
  - `GRANT SELECT, INSERT, UPDATE` sin `DELETE`, y el trigger del superadmin (MT-04);
  - `created_at` con `clock_timestamp()`, para ordenar a los profesores agregados en la misma transacción.
- **Backfill:** una fila por cada sección con `profesor_id`.
- **`es_profesor_de_seccion(seccion uuid, usuario uuid)`**, `STABLE`, con nombres calificados y sin `SET search_path`, para que PostgreSQL la expanda en la consulta y use los índices: asignación vigente y cuenta de profesor vigente. Corre con la RLS de quien consulta, que lee `seccion_profesor` y `usuario` de su universidad, así que no necesita `SECURITY DEFINER`. `REVOKE` de `PUBLIC` y `EXECUTE` para `cursus_app`.
- **Reescritas con la función** (DROP y CREATE; el `down` restaura el texto exacto):
  - `pol_nota_publicacion`, `pol_revision_notas_aprobacion` (NOT-11) y `pol_revision_notas_devolucion` (NOT-12);
  - `auditar_correccion_asistencia()` (ASI-04).

### Sincronización con `profesor_id`

Dos triggers con funciones `SECURITY DEFINER` (`search_path = pg_catalog`, nombres calificados, `REVOKE` de `PUBLIC`), para no depender de la RLS de quien hizo el cambio. Las dos son idempotentes, y la recursión termina sola, sin `pg_trigger_depth()`:

- **`seccion_profesor` → `seccion`** (`tg_seccion_profesor_sincronizar`, al insertar o archivar): deja `profesor_id` en el primer profesor vigente (por `created_at` e `id`), o `NULL`, solo si es distinto del actual.
- **`seccion` → `seccion_profesor`** (`tg_seccion_sincronizar_profesor`, al insertar o cambiar `profesor_id`, para el código de un deploy anterior):
  - primero archiva **solo** al anterior, si era distinto, no nulo y estaba vigente;
  - después agrega al nuevo si no es nulo y no está vigente;
  - nunca toca a los demás profesores.

  Como escribe `seccion_profesor` sin su RLS, primero exige que quien cambia `profesor_id` sea el Administrativo, o el dueño sin rol (migraciones y seed); si no, responde 42501. La política de UPDATE de `seccion` deja modificarla a otros roles, y sin este chequeo un profesor podría asignarse a sí mismo escribiendo `profesor_id`.

  Si el nuevo `profesor_id` ya es el primer profesor vigente, no hace nada: el cambio vino de la otra sincronización o ya estaba al día. Sin este corte, al reemplazar con el código anterior a A por C (con A, B y C asignados), la otra sincronización deja B, y esta archivaría a C para volver a crearlo con otro id y otra antigüedad.

  El orden importa: agregando primero, la otra sincronización volvería a poner al anterior y archivaría al nuevo.

**Con co-profesores**, si un deploy anterior cambia `profesor_id`, el que escribió queda asignado. Pero `profesor_id` termina en el primer vigente por antigüedad, que puede ser otro co-profesor: es lo que exige la invariante "`profesor_id` = primer profesor vigente". Un deploy anterior solo ve a ese profesor.

### Servicios

Todo lo que leía `profesor_id` usa la función o `seccion_profesor`:

- acceso a la sección (ESP-06) y archivos de la sección (MAT-01: pedir y confirmar una subida);
- notas: aprobar y devolver (NOT-11/12), nota final (NOT-02), evaluaciones (NOT-01);
- asistencia (ASI-01/02/04/05), anuncios (ANU-01/05) y actividades (MAT-08);
- pendientes (NOT-10) y cuentas del superadmin (GES-24, cuenta las asignaciones vigentes);
- nombres en los dashboards y el resumen.

En anuncios, la consulta que bloquea con `FOR SHARE` se une a `seccion_profesor` pero no la bloquea: bloquear sus filas exige su política de UPDATE, que es del Administrativo. Quitar a un profesor toma `FOR UPDATE` de la sección, así que espera ese `FOR SHARE`.

`profesor_id` solo se sigue escribiendo en el seed (GES-20) y en el `PUT` anterior. El trigger lo refleja en `seccion_profesor`.

## Retiro de `profesor_id`

En un deploy posterior, cuando ningún deploy anterior siga en uso:

1. Quitar `PUT /api/secciones/:id/profesor` y `PATCH /api/secciones/:id/profesor/quitar`, y cambiar el seed (GES-20) para que inserte en `seccion_profesor`.
2. Migración nueva:
   - `DROP TRIGGER tg_seccion_sincronizar_profesor ON seccion` y `DROP FUNCTION public.sincronizar_seccion_profesor()`;
   - `DROP TRIGGER tg_seccion_profesor_sincronizar ON seccion_profesor` y `DROP FUNCTION public.sincronizar_profesor_de_seccion()`;
   - `ALTER TABLE seccion DROP COLUMN profesor_id`, con su FK `fk_seccion_profesor` e índice `ix_seccion_profesor`;
   - un `down` que vuelva a crear la columna y la rellene con el primer profesor vigente.
3. En `@cursus/shared`, quitar los campos deprecados: `profesor` y `profesorId` de `SeccionDetalle`, `profesor` de `SeccionAlumno`, `SeccionAyudante` y `SeccionResumen`, y `QuitarProfesor`/`ProfesorCambiado`. Quitar también sus columnas en las consultas (`LEFT JOIN usuario pr ON pr.id = s.profesor_id`).
4. Ajustar los tests que arman escenarios con `UPDATE seccion SET profesor_id`, para que usen `seccion_profesor`.
5. En el frontend, quitar el respaldo de `nombresProfesores` al campo deprecado y el modo anterior del diálogo **Profesores** (`anterior`).

Falta crear la tarjeta en Trello para este deploy.

## Verificación

Desde la raíz, con Node 24.15+, dependencias instaladas y PostgreSQL disponible:

```bash
npm run lint
npm run build
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
```

- `backend/test/gestion/profesores-seccion.db-spec.ts`:
  - el backfill conserva al profesor (revierte GES-25, asigna con `profesor_id` y vuelve a migrar);
  - sincronización:
    - agregar un segundo profesor no cambia `profesor_id`;
    - quitar al primero lo pasa al siguiente, y quitar al último lo deja `NULL`;
    - el código anterior agrega al nuevo y archiva solo al anterior, sin tocar al co-profesor, con exactamente una fila nueva;
    - el código anterior sin co-profesores reemplaza al profesor, y dejar `profesor_id` en `NULL` archiva solo al anterior;
    - con A, B y C asignados, el reemplazo anterior de A por C archiva solo a A y conserva la asignación de C (mismo id y antigüedad, sin filas nuevas);
  - gestión:
    - agregar varios y listarlos, el 409 por duplicado y el 404 de un profesor de otra universidad u otro rol;
    - quitar sin motivo (400), con motivo (registra `asignacion_cambio`) y de nuevo (404);
    - el endpoint anterior de quitar con varios profesores y su 409;
    - el ayudante y el profesor no gestionan (403);
  - un segundo profesor: entra con el rol `PROFESOR`, publica anuncios, crea actividades, corrige asistencia (trigger de ASI-04), aprueba y devuelve notas, y como `cursus_app` los dos alcanzan las filas de las tres políticas reescritas;
- `backend/test/archivos/archivos.db-spec.ts`: un segundo profesor pide y confirma una subida (MAT-01), y al quitarlo recibe 403 en las dos.
  - un profesor quitado ya no entra a la sección, no aprueba y la RLS no le alcanza filas; el que sigue mantiene el acceso;
  - RLS de `seccion_profesor`:
    - otra universidad no ve filas, su INSERT falla (42501) y su UPDATE no alcanza filas;
    - el profesor lee pero no escribe, y tampoco se asigna escribiendo `seccion.profesor_id` (42501 del trigger);
    - el Administrativo escribe;
    - un Administrativo de otra universidad recibe 404 por la API.
- `backend/test/database/esquema-inicial.db-spec.ts`: la migración se revierte primero, sin la tabla, la función ni los triggers. Las tres políticas y el trigger de ASI-04 vuelven a `s.profesor_id`, y revertir, aplicar y revertir deja exactamente las mismas definiciones.
- `backend/test/multitenant/rls.db-spec.ts`: `seccion_profesor` en el contrato del schema (RLS e `INSERT`/`SELECT`/`UPDATE`) y con el trigger del superadmin.
- `backend/test/gestion/profesores-seccion.e2e-spec.ts`:
  - agregar responde 200 y un duplicado 409;
  - agregar sin `profesorId` o con uno que no es UUID responde 400;
  - quitar sin motivo, vacío o demasiado largo responde 400, y con motivo 200;
  - 401 sin sesión, y 403 por CASL para el profesor, el ayudante, el alumno y el Director.
- `frontend/src/pages/ProfesoresSeccion.test.tsx`:
  - agregar un segundo profesor (solo se ofrecen los no asignados) actualiza la lista y la tabla;
  - quitar exige motivo y deja a los demás, y cancelar no envía;
  - muestra la lista vacía y el error con reintento;
  - un 409 o un fallo de red muestran el error y desbloquean, y un 404 al quitar recarga la lista;
  - el Director no ve el botón;
  - con un backend anterior, reemplazar usa el `PUT` y quitar el `PATCH` de GES-12 y GES-14, sin pedir los endpoints nuevos.
- Los tests existentes siguen pasando sin reescribirse: el trigger inverso refleja en `seccion_profesor` cada `UPDATE seccion SET profesor_id`.

## Revisión en local

1. Levantar backend y frontend con las migraciones y el seed de facultad completa.
2. Como Administrativo, abrir un curso → **Profesores** de una sección → agregar un segundo profesor.
3. Como cada profesor, entrar a la sección: los dos registran asistencia y aprueban notas en revisión.
4. Como Administrativo, quitar a uno con motivo. Ese profesor ya no entra a la sección; el otro sí.

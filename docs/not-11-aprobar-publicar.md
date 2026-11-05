# NOT-11: el profesor aprueba y publica las notas

Tarjeta: NOT-11. Depende de NOT-04 (auditoría), NOT-05 (notas), NOT-07 y NOT-08 (revisión y envío) y NOT-10 (pendientes), ya integradas en `develop`.

**Como** profesor, **quiero** aprobar y publicar las notas de una evaluación, **para** que cada alumno vea la suya.

## Criterios

| Criterio                                                          | Cómo se cumple                                                                                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Al aprobar, todas las notas de la evaluación pasan a `PUBLICADA`. | `POST .../notas/aprobacion` publica en una transacción todas las notas activas y deja la revisión en `APROBADA`.                             |
| Las publicadas quedan visibles para cada alumno.                  | Queda lista la base: `nota.estado = 'PUBLICADA'`. Cómo las lee el alumno es NOT-13; su RLS y sus endpoints no cambian aquí.                  |
| La aprobación queda en auditoría con fecha y profesor.            | Un evento `APROBACION` de la evaluación y un `PUBLICACION` por nota en `nota_cambio` (NOT-04), con `responsable_id` = el profesor y `fecha`. |

## Comportamiento

En **Evaluaciones pendientes de revisión** (NOT-10), al abrir una con **Ver notas**:

- debajo de la tabla aparece **Aprobar y publicar**;
- al pulsarlo se pide **confirmación** en la misma página: "¿Aprobar y publicar las notas? Los alumnos podrán verlas y ya no se podrán editar.", con **Publicar** y **Cancelar**;
- mientras publica, **Publicando…** y **Cancelar** quedan deshabilitados. Se desbloquean siempre (en un `finally`), también si la respuesta no llega;
- **con éxito**, la tabla se cierra, arriba de la lista se lee "Control 1: Notas aprobadas y publicadas." y la lista se recarga: la evaluación ya no está pendiente;
- **con un error** (500 o sin conexión) aparece el mensaje con `role="alert"` y la confirmación sigue abierta para reintentar;
- **con un 409** (por ejemplo, ya se aprobó desde otra pestaña) se muestra el mensaje del servidor como aviso y la lista se recarga.

El botón solo aparece en la vista de pendientes y con la evaluación en revisión. En la pestaña Notas de la sección no cambia nada.

**Alumnos sin nota:** si alguien se inscribió después del envío (NOT-08), la fila de pendientes ya lo advierte ("1 alumno sin nota"). Aprobar publica las notas que existen; ese alumno queda sin nota. Para agregarla, el profesor deberá devolver la evaluación (NOT-12) en vez de aprobarla.

## API

`POST /api/espacio/secciones/:id/evaluaciones/:evaluacionId/notas/aprobacion`, sin cuerpo.

| Resultado                                                             | Cuándo                                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **200**, `NotasEvaluacion` con `estado: 'APROBADA'`                   | Se aprobó: todas las notas en `PUBLICADA`. 200 y no 201, como el envío.                                                                     |
| **409** "Las notas aún no se envían a revisión"                       | En `BORRADOR` (con o sin fila en `revision_notas`).                                                                                         |
| **409** "Las notas fueron devueltas al ayudante"                      | En `DEVUELTA`.                                                                                                                              |
| **409** "Las notas ya fueron aprobadas"                               | En `APROBADA`, también la segunda de dos aprobaciones a la vez.                                                                             |
| **409** "Hay notas que no están propuestas en la escala de 1,0 a 7,0" | Alguna nota activa no está `PROPUESTA` o está fuera de rango. No pasa por la API; se revisa igual antes de publicar.                        |
| **409** "La evaluación no tiene notas que publicar"                   | En revisión pero sin notas activas.                                                                                                         |
| **403**                                                               | No es el profesor de la sección: el ayudante, el alumno, el Administrativo y el Director (CASL), o un profesor que no es el de esa sección. |
| **404**                                                               | La evaluación no existe, está archivada, es de otra sección o de otra universidad.                                                          |
| **401**                                                               | Sin sesión.                                                                                                                                 |

Permisos en tres capas:

- **CASL:** `@Puede('update', 'RevisionNotas')`, un sujeto nuevo para la tabla `revision_notas`. Lo tiene solo el profesor, y leen los mismos que las notas. El envío del ayudante (NOT-08) sigue con `update` de `Nota`.
- **Sección:** `IntegranteSeccionGuard` y el rol de la sección (`PROFESOR`).
- **Servicio:** dentro de la transacción vuelve a comprobar que `seccion.profesor_id` sea el usuario.

La aprobación, en una transacción:

1. Fija el usuario de la sesión (`app.usuario_id`, ver Datos) y toma el lock de la evaluación (`notas:<evaluacionId>`, el mismo del PUT y del envío). Una segunda aprobación, un guardado o un envío esperan.
2. Comprueba la evaluación (404), que sea el profesor de la sección (403) y que esté `EN_REVISION` (409).
3. Cuenta las notas activas que no son `PROPUESTA` o están fuera de 1,0 a 7,0. Si hay alguna, responde 409 sin cambiar nada.
4. Pasa todas las notas `PROPUESTA` activas a `PUBLICADA` y la revisión de `EN_REVISION` a `APROBADA`, con `actualizado_por` = el profesor. Si el UPDATE de la revisión no modifica la fila, responde 500 y revierte todo.
5. Registra un `PUBLICACION` por nota (alumno y nota publicada) y un `APROBACION` de la evaluación.

Con dos aprobaciones a la vez, una responde 200 y la otra 409, y la auditoría queda una sola vez.

## Datos

La migración `1792720000000-AprobarNotas` no crea tablas.

- **`usuario_actual()`**, como `universidad_actual()` y `rol_actual()`: lee `app.usuario_id`.
  - La API lo fija solo en la transacción de la aprobación, con `fijarUsuario` de `base-de-datos.service.ts`.
  - Sin él, ninguna política del profesor alcanza filas.
  - Las políticas que lo usan son solo estas dos; `rls.db-spec.ts` lo comprueba.
- **`pol_nota_publicacion`** (UPDATE de `nota`), solo para el rol `PROFESOR`:
  - `USING`: una nota `PROPUESTA` activa, de su universidad, de una evaluación `EN_REVISION` cuya sección tiene como profesor a `usuario_actual()`.
  - `WITH CHECK`: queda `PUBLICADA`, activa, en la escala y en la misma condición de sección.
  - Las políticas del ayudante exigen `PROPUESTA`, así que una nota publicada no la modifica nadie. Recorregirla será NOT-15.
- **`tg_nota_publicar_sin_cambios`**: la política no ve la fila anterior, así que un trigger impide que publicar cambie algo más que el estado: el valor, el alumno, la evaluación, la universidad, quién la propuso o `archived_at` (`check_violation`), también para el dueño de la tabla.
- **`pol_revision_notas_aprobacion`** (UPDATE de `revision_notas`), solo para el rol `PROFESOR` de la sección: de `EN_REVISION` a `APROBADA`, a su nombre (`actualizado_por = usuario_actual()`). Usa el `GRANT UPDATE (estado, actualizado_por)` de NOT-08.
- **`nota_cambio`**: el tipo nuevo `PUBLICACION`, con alumno y nota nueva y sin nota anterior (`ck_nota_cambio_tipo` y `ck_nota_cambio_alcance`).
  - La tabla sigue siendo de solo adición.
  - En `@cursus/shared`, `TIPOS_EVENTO_NOTA` lo incluye.
- **Sin cambios en el GRANT:** `nota` ya tenía `UPDATE` (NOT-05) y nadie tiene `DELETE`. Las FKs compuestas por universidad son las de NOT-04, NOT-05 y NOT-07.

`down` quita las políticas, el trigger y `usuario_actual()`. Los CHECK de NOT-04 vuelven como `NOT VALID`: los eventos `PUBLICACION` ya registrados no se borran, porque `nota_cambio` es inmutable, y los CHECK siguen rigiendo para lo nuevo. Las notas quedan como estén.

**Alcance de la RLS: por sección,** a diferencia del envío (NOT-08), que es por universidad y rol. El profesor de otra sección de la misma universidad no alcanza filas aunque use SQL directo como `cursus_app`.

## Verificación

Desde la raíz, con Node 24.15+, dependencias instaladas y PostgreSQL disponible:

```bash
npm run lint
npm run build
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
```

- `backend/test/notas/notas.db-spec.ts`:
  - la aprobación publica todas las notas, deja la revisión en `APROBADA` con el profesor y registra un `APROBACION` y un `PUBLICACION` por nota, con fecha y profesor;
  - sin fila, en `BORRADOR`, `DEVUELTA` o `APROBADA` responde 409 con su mensaje, sin publicar ni dejar eventos, y una segunda aprobación responde 409 sin duplicar la auditoría;
  - dos aprobaciones a la vez: una responde 200 y la otra 409, con la auditoría una sola vez;
  - una nota que no está propuesta responde 409 sin publicar las demás;
  - el ayudante, el alumno, el Administrativo, el Director y un profesor de otra sección reciben 403; un profesor de otra universidad y una evaluación archivada, 404;
  - regresión: después de aprobar, el PUT del ayudante responde 409 y su UPDATE como `cursus_app` no alcanza las notas publicadas;
  - RLS como `cursus_app`:
    - el profesor de la sección publica y aprueba (control positivo);
    - el ayudante no publica (42501) ni aprueba (0 filas);
    - otro profesor, el profesor sin usuario en la sesión y otra universidad no alcanzan filas;
    - en borrador, devuelta o aprobada el profesor no publica;
    - publicar no cambia el valor, ni archiva la nota, ni cambia quién la propuso (trigger);
    - el profesor no aprueba a nombre de otro usuario (42501);
    - el profesor no pasa la revisión a `DEVUELTA` ni `BORRADOR`;
    - una publicada no vuelve a propuesta.
- `backend/test/notas/auditoria-notas.db-spec.ts`: `PUBLICACION` se registra con alumno y nota, y se rechaza sin alumno, sin nota o con nota anterior.
- `backend/test/database/esquema-inicial.db-spec.ts`: la migración se revierte primero y no deja políticas, trigger, funciones ni el tipo nuevo.
- `backend/test/multitenant/rls.db-spec.ts`: el contrato del schema cuenta los comandos sin repetir (ahora hay dos UPDATE en `nota` y `revision_notas`), y las políticas con `usuario_actual()` son solo las dos de la aprobación.
- `backend/test/notas/aprobacion.e2e-spec.ts`, con el acceso a la sección y el servicio reemplazados:
  - 401 sin sesión, 200 con las notas aprobadas y el 409 con su mensaje;
  - 403 por CASL para el ayudante, el alumno, el Administrativo y el Director;
  - 403 para un profesor que entra a la sección con otro rol;
  - 400 con un id que no es UUID.
- `backend/src/auth/permisos.spec.ts`: la matriz de `RevisionNotas`.
- `frontend/src/pages/PendientesRevision.test.tsx`:
  - la confirmación se puede cancelar sin aprobar, y al publicar aparece el aviso y la evaluación sale de la lista;
  - mientras publica, los botones quedan bloqueados;
  - un 500 o un fallo de red muestran el error, desbloquean y permiten reintentar;
  - un 409 muestra el mensaje del servidor;
  - una evaluación aprobada no muestra el botón.

## Revisión en local

1. Levantar backend y frontend con las migraciones y el seed de facultad completa.
2. Como ayudante, ingresar todas las notas de una evaluación y enviarla a revisión (NOT-08).
3. Como profesor de la sección, abrir **Dashboard** → **Ver pendientes** → **Ver notas**.
4. Pulsar **Aprobar y publicar**, luego **Cancelar**: no pasa nada. Pulsar de nuevo y **Publicar**: aparece "… Notas aprobadas y publicadas." y la evaluación ya no está en la lista.
5. Como ayudante, abrir la evaluación en **Notas**: se lee "Estado: Aprobada", las notas dicen "Publicada" y no se editan.

# NOT-12: el profesor devuelve un envío de notas al ayudante

Tarjeta: [F4 · NOT-12](https://trello.com/c/wKstWaZk). Depende de NOT-04 (auditoría), NOT-05 y NOT-07 (notas y borrador), NOT-08 (envío), NOT-10 (pendientes) y NOT-11 (aprobación), ya integradas en `develop`.

**Como** profesor, **quiero** devolver al ayudante un envío de notas con un comentario, **para** que las corrija antes de publicarlas.

## Criterios

| Criterio                                                                 | Cómo se cumple                                                                                                                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El comentario es obligatorio.                                            | El DTO lo exige (trim, no vacío, hasta 500 caracteres, sin caracteres de control) y la base también: `ck_revision_notas_comentario` y la RLS de la devolución. |
| La evaluación queda `DEVUELTA` y vuelve a ser editable para el ayudante. | `revision_notas.estado = 'DEVUELTA'`. Las políticas y el servicio de NOT-05, NOT-07 y NOT-08 ya la tratan como editable: el ayudante guarda y vuelve a enviar. |
| La devolución queda en auditoría con fecha, profesor y comentario.       | Un evento `DEVOLUCION` en `nota_cambio` (NOT-04), con `responsable_id` = el profesor, `fecha` y el comentario en `motivo`, en la misma transacción.            |

## Comportamiento

En **Evaluaciones pendientes de revisión** (NOT-10), al abrir una con **Ver notas** aparecen **Aprobar y publicar** (NOT-11) y **Devolver**.

**Devolver** abre en la misma página:

- el texto "Las notas vuelven al ayudante para que las corrija y las envíe de nuevo. No se publica nada.";
- el campo **Comentario para el ayudante (obligatorio)**, con un contador "n/500 caracteres" (`aria-describedby`):
  - el contador cuenta caracteres como el backend (`Array.from`), no unidades UTF-16: un emoji cuenta uno;
  - el campo no tiene `maxLength`, que cuenta unidades UTF-16 y cortaría antes de los 500 que acepta el backend;
  - pasado el límite, sin contar los espacios de los extremos, aparece "El comentario puede tener hasta 500 caracteres.", el campo queda `aria-invalid` y no se puede confirmar;
- **Confirmar devolución**, deshabilitado mientras el comentario esté vacío o tenga solo espacios, y **Cancelar**.

Al confirmar:

- mientras devuelve, **Devolviendo…**, **Cancelar**, el campo y **Aprobar y publicar** quedan deshabilitados. Se desbloquean siempre (en un `finally`), también si la respuesta no llega;
- **con éxito**, la tabla se cierra, arriba de la lista se lee "Control 1: Notas devueltas al ayudante." y la lista se recarga: la evaluación ya no está pendiente;
- **con un error** (500, sin conexión o un 400 de validación) aparece el mensaje con `role="alert"`. El panel sigue abierto con el comentario escrito, para reintentar;
- **con un 409 de estado** (por ejemplo, otra pestaña ya la aprobó) pasa lo mismo que en NOT-11: se muestra el mensaje del servidor como aviso, la tabla se cierra y la lista se recarga. Un 409 sin `estado` deja el panel abierto con el mensaje.

El ayudante ve la evaluación como "Estado: Devuelta", con los campos editables, **Guardar borrador** y **Enviar a revisión**. [NOT-09](not-09-estado-envios.md) muestra el comentario de `revision_notas.comentario_devolucion` en el listado y el detalle; al reenviar, el comentario actual desaparece.

## API

`POST /api/espacio/secciones/:id/evaluaciones/:evaluacionId/notas/devolucion`, con cuerpo `{ "comentario": string }` (`DevolverNotas` en `@cursus/shared`).

| Resultado                                                 | Cuándo                                                                                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **200**, `NotasEvaluacion` con `estado: 'DEVUELTA'`       | Se devolvió. Las notas siguen en `PROPUESTA`.                                                                                                                                                           |
| **400** "El comentario es obligatorio"                    | Falta, no es texto, está vacío o tiene solo espacios.                                                                                                                                                   |
| **400** "El comentario puede tener hasta 500 caracteres"  | Tiene más de 500 caracteres sin los espacios de los extremos, contados como `length()` de PostgreSQL. No se usa `@MaxLength`, que no cuenta los selectores de variante: 500 "❤️" son 1000 para la base. |
| **400** "El comentario contiene caracteres no permitidos" | Tiene caracteres de control. Como el motivo de ASI-04, se aceptan saltos de línea y tabuladores.                                                                                                        |
| **400**                                                   | El cuerpo trae otros campos (`forbidNonWhitelisted`).                                                                                                                                                   |
| **409** con `estado` (`ErrorEstadoRevision`)              | No está `EN_REVISION`, con los mensajes de NOT-11: "Las notas aún no se envían a revisión", "Las notas fueron devueltas al ayudante" o "Las notas ya fueron aprobadas".                                 |
| **403**                                                   | No es el profesor de la sección: el ayudante, el alumno, el Administrativo y el Director (CASL), o un profesor que no es el de esa sección.                                                             |
| **404**                                                   | La evaluación no existe, está archivada, es de otra sección o de otra universidad.                                                                                                                      |
| **401**                                                   | Sin sesión.                                                                                                                                                                                             |

El comentario se guarda sin los espacios de los extremos. Los permisos son los de NOT-11: CASL `@Puede('update', 'RevisionNotas')`, `IntegranteSeccionGuard` con el rol `PROFESOR` en la sección, y el servicio comprueba dentro de la transacción que sea profesor de la sección (desde [GES-25](ges-25-varios-profesores.md), cualquiera de sus profesores vigentes).

La devolución, en una transacción:

1. Fija el usuario (`fijarUsuario`) y toma el lock de la evaluación (`notas:<evaluacionId>`), como la aprobación.
2. Comprueba la evaluación (404), que sea el profesor de la sección (403) y que esté `EN_REVISION` (409 con el estado). Esta parte es la misma función que usa la aprobación (`bloquearEvaluacionEnRevision`).
3. Pasa la revisión a `DEVUELTA`, con `actualizado_por` = el profesor y el comentario. Si el UPDATE no modifica la fila, responde 500 y revierte todo.
4. Registra el evento `DEVOLUCION` con el comentario como `motivo`.

**Aprobar y devolver a la vez:** las dos esperan el mismo lock. Una responde 200 y la otra 409 con el estado nuevo, y queda un solo evento.

## Datos

La migración `1792740000000-DevolverNotas` no crea tablas.

- **`revision_notas.comentario_devolucion`** (text, nulo): el último comentario de devolución, para mostrarlo al ayudante (NOT-09).
  - `ck_revision_notas_comentario`: nulo, o de 1 a 500 caracteres sin los espacios de los extremos. Es el mismo largo que `nota_cambio.motivo`.
  - Al reenviar se borra (lo hace el trigger): solo una evaluación `DEVUELTA` tiene comentario, y una nueva devolución exige uno nuevo. El historial completo está en `nota_cambio`.
- **`GRANT UPDATE (comentario_devolucion)`** a `cursus_app`, junto al `UPDATE (estado, actualizado_por)` de NOT-08. Sin `DELETE`.
- **`tg_revision_notas_comentario_al_devolver`**: el GRANT es por columna y no por política, así que el envío del ayudante y la aprobación también podrían escribir el comentario. El trigger solo deja escribirlo al pasar de `EN_REVISION` a `DEVUELTA` (`check_violation`), también para el dueño de la tabla, y lo borra al pasar de `DEVUELTA` a `EN_REVISION`.
- **`pol_revision_notas_devolucion`** (UPDATE de `revision_notas`), solo para el rol `PROFESOR` y con `usuario_actual()`, como en NOT-11:
  - `USING`: la revisión está `EN_REVISION` y la sección de la evaluación tiene como profesor a `usuario_actual()` (desde [GES-25](ges-25-varios-profesores.md), cualquiera de sus profesores vigentes): `es_profesor_de_seccion`.
  - `WITH CHECK`: queda `DEVUELTA`, a su nombre (`actualizado_por = usuario_actual()`), con comentario y en la misma condición de sección.
- **Sin cambios en `nota`:** las políticas del ayudante de NOT-08 ya aceptan `DEVUELTA` (`ESCRIBE_AYUDANTE_EDITABLE`), y su política de envío pasa de `DEVUELTA` a `EN_REVISION`.

`down` quita la política, el trigger y el GRANT, y luego la columna con su CHECK. Los comentarios se pierden de `revision_notas`, pero siguen en los eventos `DEVOLUCION`. Las evaluaciones devueltas quedan así.

## Lo que resuelve de NOT-11

Un alumno inscrito después del envío (NOT-08) queda sin nota mientras la evaluación está en revisión. Ahora el profesor la devuelve, el ayudante le ingresa la nota, la vuelve a enviar y el profesor la aprueba. Hay un test db que recorre ese caso completo.

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
  - la devolución deja `DEVUELTA` con el comentario sin espacios, las notas en `PROPUESTA` y un evento `DEVOLUCION` con fecha, profesor y comentario;
  - sin fila, en `BORRADOR`, `DEVUELTA` o `APROBADA` responde 409 con el estado y no deja eventos;
  - un comentario que falta, vacío, de solo espacios, que no es texto, de más de 500 caracteres (también 500 "❤️"), con un carácter de control o con campos de más responde 400 sin cambiar nada; 500 caracteres con emojis o con saltos de línea se aceptan;
  - el ayudante, el alumno, el Administrativo, el Director y un profesor de otra sección reciben 403, y uno de otra universidad 404;
  - aprobar y devolver a la vez: uno responde 200 y el otro 409, con un solo evento;
  - tras devolver, el ayudante edita, otro ayudante reenvía (vuelve a `EN_REVISION`, sin el comentario) y el profesor aprueba. El historial queda `ENVIO`, `DEVOLUCION`, `ENVIO`, `APROBACION`;
  - tras devolver, el ayudante le pone nota a un alumno inscrito después del envío (en revisión, el PUT responde 409);
  - RLS como `cursus_app`:
    - el profesor de la sección devuelve (control positivo);
    - sin comentario o a nombre de otro usuario, 42501, y con un comentario de solo espacios, CHECK;
    - el ayudante, otro profesor, el profesor sin usuario en la sesión y otra universidad no alcanzan filas;
    - el comentario no se escribe al aprobar ni al reenviar (trigger);
    - tras reenviar, una nueva devolución sin comentario nuevo falla (42501).
- `backend/test/database/esquema-inicial.db-spec.ts`: la migración se revierte primero y no deja política, trigger, función ni columna.
- `backend/test/multitenant/rls.db-spec.ts`: las políticas con `usuario_actual()` son las dos de NOT-11 y la de la devolución.
- `backend/test/notas/revision.e2e-spec.ts` (antes `aprobacion.e2e-spec.ts`), con el acceso a la sección y el servicio reemplazados:
  - 401 sin sesión, 200 con el comentario sin espacios, y el 409 con mensaje y estado;
  - cada comentario inválido responde 400 sin llegar al servicio;
  - 403 por CASL para el ayudante, el alumno, el Administrativo y el Director;
  - 403 para un profesor que entra a la sección con otro rol.
- `frontend/src/pages/PendientesRevision.test.tsx`:
  - el comentario es obligatorio y tiene contador, y cancelar no devuelve;
  - el contador cuenta un emoji como un carácter y acepta 500 emojis; con 501 avisa y no deja confirmar;
  - al confirmar se envía sin espacios, aparece el aviso y la evaluación sale de la lista;
  - mientras devuelve todo queda bloqueado, y un error lo desbloquea y conserva el comentario;
  - un fallo de red y un 400 muestran el error;
  - un 409 de estado cierra el panel y uno sin estado lo deja abierto.

## Revisión en local

1. Levantar backend y frontend con las migraciones y el seed de facultad completa.
2. Como ayudante, ingresar todas las notas de una evaluación y enviarla a revisión (NOT-08).
3. Como profesor de la sección: **Dashboard** → **Ver pendientes** → **Ver notas** → **Devolver**. Con el comentario vacío no se puede confirmar. Escribir un comentario y pulsar **Confirmar devolución**: aparece "… Notas devueltas al ayudante." y la evaluación ya no está en la lista.
4. Como ayudante, abrir la evaluación en **Notas**: se lee "Estado: Devuelta". Cambiar una nota, **Guardar borrador** y **Enviar a revisión**.
5. Como profesor, la evaluación vuelve a pendientes. **Aprobar y publicar**: las notas quedan publicadas.

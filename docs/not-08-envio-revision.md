# NOT-08: el ayudante envía las notas a revisión

Tarjeta: [F4 · NOT-08](https://trello.com/c/zsei7Uyn). Depende de NOT-05 (ingreso de notas), NOT-06 (escala 1,0 a 7,0) y NOT-07 (borrador), ya integradas en `develop`.

**Como** ayudante, **quiero** enviar las notas de una evaluación a revisión, **para** que el profesor las valide.

## Criterios

| Criterio                                                                                | Cómo se cumple                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Solo se puede enviar cuando todos los alumnos tienen nota válida.                       | El envío revisa, dentro de la transacción y con el lock de la evaluación, a los alumnos con inscripción activa en ese momento. Si a alguno le falta la nota, responde 400 con `faltantes` y no cambia nada. En pantalla, "Enviar a revisión" queda deshabilitado mientras falte una nota guardada. |
| Al enviar, las notas quedan bloqueadas para el ayudante hasta que el profesor responda. | `revision_notas` pasa a `EN_REVISION`. El PUT de notas responde 409, la RLS de `nota` no deja escribir al ayudante y los campos quedan en solo lectura.                                                                                                                                            |
| El envío queda registrado en auditoría con fecha y ayudante.                            | Un evento `ENVIO` en `nota_cambio`, en la misma transacción, con `responsable_id` (el ayudante) y `fecha` (`clock_timestamp()`).                                                                                                                                                                   |

## Comportamiento

- **Enviar a revisión** va junto a **Guardar borrador**. Está deshabilitado si:
  - a algún alumno le falta la nota guardada (un texto lo explica);
  - hay cambios sin guardar;
  - hay una nota inválida;
  - se está guardando.

  Se envía lo guardado, no lo que está escrito sin guardar.

- Antes de enviar se pide **confirmación** en la misma página: "¿Enviar las notas a revisión? No podrás editarlas hasta que el profesor responda.", con **Enviar** y **Cancelar**.
- **Al enviar:**
  - se aplica el estado que devuelve el POST, sin esperar otra recarga, y se lee "Estado: En revisión";
  - aparece el aviso "Notas enviadas a revisión.";
  - los campos quedan de solo lectura (`readonly`) y desaparecen los dos botones.

  Una evaluación en revisión o aprobada se abre así directamente.

- **Si falla:**
  - el error se muestra con `role="alert"`;
  - la confirmación sigue abierta para reintentar;
  - un 400 con `faltantes` nombra a los alumnos sin nota;
  - un 409 muestra el mensaje del servidor y deja los campos en solo lectura en el acto, sin esperar la recarga que trae el estado nuevo.
- Una evaluación **devuelta** (NOT-12) vuelve a editarse y a enviarse.
- **Después de guardar**, la recarga aplica también el estado: si otro ayudante envió la evaluación entre el PUT y la recarga, queda en revisión y de solo lectura.

## API

`POST /api/espacio/secciones/:id/evaluaciones/:evaluacionId/notas/envio`, sin cuerpo.

| Resultado                                                                                        | Cuándo                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **200**, `NotasEvaluacion` con `estado: 'EN_REVISION'`                                           | Se envió. Es 200 y no 201 porque cambia el estado de la evaluación, no crea un recurso.                                                                                          |
| **400** `{ statusCode, message: 'Faltan notas', faltantes: [alumnoId] }` (`ErrorNotasFaltantes`) | A algún alumno con inscripción activa le falta una nota válida. No cambia nada ni deja eventos.                                                                                  |
| **400** "La sección no tiene alumnos inscritos"                                                  | La sección no tiene alumnos activos.                                                                                                                                             |
| **409** "Las notas están en revisión" / "Las notas ya fueron aprobadas"                          | La evaluación ya está en `EN_REVISION` o en `APROBADA`.                                                                                                                          |
| **403**                                                                                          | Quien envía no es ayudante de la sección (el profesor, el alumno, el Administrativo, el Director o un ayudante de otra sección). Se vuelve a comprobar dentro de la transacción. |
| **404**                                                                                          | La evaluación no existe, está archivada, es de otra sección o de otra universidad.                                                                                               |
| **401**                                                                                          | Sin sesión.                                                                                                                                                                      |

El envío, en una transacción:

1. Toma el mismo advisory lock que el PUT (`notas:<evaluacionId>`): un guardado o un segundo envío esperan. Con dos envíos a la vez, uno responde 200 y el otro 409, y queda un solo evento.
2. Comprueba la evaluación, que quien envía sea ayudante de la sección y el estado.
3. Lee las inscripciones activas fijadas con `FOR SHARE` y las notas activas. Una nota guardada siempre cumple la escala, pero se vuelve a revisar con `esNotaValida`.
4. Crea la fila de `revision_notas` si no existía, la pasa a `EN_REVISION` con `actualizado_por` = el ayudante y registra el evento `ENVIO`. Si el UPDATE no modifica la fila, responde 500 y revierte todo.

**El PUT de notas** (NOT-05) responde **409** con el mismo mensaje si la evaluación no está en `BORRADOR` ni `DEVUELTA`, antes de escribir.

## Datos

La migración `1792710000000-EnviarNotasRevision` no crea tablas:

- `GRANT UPDATE (estado, actualizado_por) ON revision_notas`, solo esas columnas: un UPDATE no mueve la fila a otra evaluación ni universidad. Y la política `pol_revision_notas_envio`. Solo el rol `AYUDANTE`, en su universidad, y solo de `BORRADOR` o `DEVUELTA` (`USING`) a `EN_REVISION` (`WITH CHECK`):
  - pasar a otro estado falla con un error de RLS;
  - el UPDATE de una evaluación en revisión o aprobada no la alcanza;
  - para los demás roles, el UPDATE no alcanza filas.
- **Las políticas de escritura del ayudante en `nota`** (`pol_nota_insercion` y `pol_nota_modificacion`) exigen además que la evaluación sea editable:

  ```sql
  COALESCE((SELECT r.estado FROM revision_notas r
             WHERE r.evaluacion_id = nota.evaluacion_id
               AND r.universidad_id = nota.universidad_id), 'BORRADOR')
    IN ('BORRADOR', 'DEVUELTA')
  ```

  Sin fila, es un borrador (NOT-07). Con la evaluación en revisión o aprobada, un INSERT del ayudante falla con un error de RLS y su UPDATE no alcanza filas, así que el bloqueo no depende solo del servicio. La condición va solo en esas políticas del ayudante: publicar (NOT-11) agregará una política propia del profesor, que PostgreSQL combina con OR.

- `down` deja las políticas de `nota` como en NOT-05, quita la política de envío y revoca el UPDATE. No cambia las filas: una evaluación que quedó `EN_REVISION` volvería a editarse con el código de NOT-07.

**Quien escriba notas debe tomar el lock `notas:<evaluacionId>`.** La condición de la RLS lee el estado al ejecutar la sentencia, sin bloquear la fila de `revision_notas`. Lo que impide que una nota cambie durante o después de un envío es el advisory lock. El PUT y el envío lo toman; NOT-11 (publicar) y NOT-15 (recorregir) deberán tomarlo también.

**Alcance de la RLS: por universidad y rol, no por sección,** como en `nota` (NOT-05). Un ayudante con SQL directo como `cursus_app` podría enviar una evaluación de otra sección de su universidad. Por la API no es posible, porque el servicio exige ser ayudante de la sección. Se cerrará cuando exista `usuario_actual()`.

**Auditoría:** `ENVIO` sin alumno ni notas, como exige `ck_nota_cambio_alcance` (NOT-04).

## Un alumno inscrito después del envío

El envío exige nota para los alumnos activos **en ese momento**. Si después se inscribe otro alumno, queda **sin nota**: la evaluación sigue en revisión y el ayudante no puede agregarla, porque el PUT responde 409 y la RLS lo impide. Se resuelve cuando el profesor responda:

- **NOT-12:** el profesor devuelve la evaluación, el ayudante agrega la nota y vuelve a enviar.
- **NOT-10 y NOT-11:** la vista de pendientes y la publicación deberán mostrar o advertir a los alumnos sin nota.

Una inscripción nueva no toma el lock de las notas, así que también puede quedar confirmada **durante** un envío: el envío se completa y ese alumno queda sin nota, igual que si se hubiera inscrito justo después.

Lo mismo con un alumno retirado después del envío: su nota queda, pero no cuenta en la sección.

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
  - el envío con todas las notas pasa a `EN_REVISION` y deja un evento `ENVIO` con fecha y ayudante, y el profesor lee `EN_REVISION`;
  - con notas faltantes (o sin ninguna) responde 400 con los alumnos activos que faltan, sin el retirado, y no cambia nada ni deja eventos;
  - un segundo envío responde 409 con un solo evento, una evaluación aprobada responde 409 y una devuelta se vuelve a enviar;
  - también envía si las notas no pasaron por el PUT;
  - el PUT en revisión o aprobada responde 409 sin cambiar notas, y en devuelta guarda;
  - el profesor, el alumno, el Administrativo, el Director y un ayudante de otra sección reciben 403, un ayudante de otra universidad 404, y una evaluación de otra sección, archivada o inexistente 404;
  - dos envíos a la vez: uno responde 200, el otro 409, y queda un solo evento;
  - RLS como `cursus_app`:
    - el ayudante pasa de `BORRADOR` o `DEVUELTA` a `EN_REVISION`;
    - pasar un borrador a `APROBADA`, `DEVUELTA` o `BORRADOR` falla;
    - su UPDATE no alcanza una evaluación en revisión o aprobada, ni una de otra universidad;
    - para los demás roles, el UPDATE no alcanza la fila;
    - nadie hace DELETE;
    - en `nota`, el ayudante inserta y modifica sin fila, en `BORRADOR` y en `DEVUELTA`; en `EN_REVISION` y `APROBADA` su INSERT falla y su UPDATE no alcanza filas.
- `backend/test/database/esquema-inicial.db-spec.ts` y `backend/test/multitenant/rls.db-spec.ts`: la migración se revierte primero, sin dejar la política, el UPDATE ni la condición en `nota`; `revision_notas` tiene `INSERT`, `SELECT` y `UPDATE`.
- `backend/test/notas/notas.e2e-spec.ts`: 401, 403 por rol y sin otras rutas de envío.
- `frontend/src/pages/NotasDeEvaluacion.test.tsx`:
  - el botón queda deshabilitado con notas faltantes o sin guardar;
  - la confirmación se puede cancelar;
  - el envío deja "Estado: En revisión", los campos en solo lectura y sin botones;
  - con la recarga demorada, los campos quedan en solo lectura apenas responde el POST;
  - si la recarga después de guardar trae `EN_REVISION`, la pantalla queda en revisión y de solo lectura;
  - un 409 del envío o del PUT, con la recarga demorada, deja los campos en solo lectura de inmediato;
  - una evaluación en revisión o aprobada se abre en solo lectura, y una devuelta se edita;
  - un error permite reintentar;
  - un 400 con `faltantes` nombra a los alumnos, y un 409 muestra el mensaje.

## Revisión en local

1. Levantar backend y frontend con las migraciones y el seed de facultad completa.
2. Como ayudante, abrir **Notas** e **Ingresar notas** en una evaluación. Con algún alumno sin nota, "Enviar a revisión" está deshabilitado.
3. Ingresar todas las notas y pulsar **Guardar borrador**. Pulsar **Enviar a revisión**, luego **Cancelar**: no pasa nada.
4. Pulsar **Enviar a revisión** y **Enviar**: se lee "Estado: En revisión" y los campos quedan de solo lectura.
5. Volver a abrir la evaluación: sigue en revisión, sin botones.

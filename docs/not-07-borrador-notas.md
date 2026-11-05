# NOT-07: el ayudante guarda las notas como borrador

Tarjeta: [F4 · NOT-07](https://trello.com/c/jseX1iAf). Depende de NOT-05 (ingreso de notas) y NOT-06 (escala 1,0 a 7,0), ya integradas en `develop`.

**Como** ayudante, **quiero** guardar las notas como borrador, **para** terminar de ingresarlas después sin perder lo avanzado.

## Criterios

| Criterio                                                                       | Cómo se cumple                                                                                                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un botón "Guardar borrador" guarda las notas ingresadas aunque falten alumnos. | "Guardar borrador" reemplaza a "Guardar notas" y usa el PUT de NOT-05, que ya acepta cualquier subconjunto de los alumnos.                         |
| Al volver a la evaluación, se recuperan las notas guardadas.                   | El GET devuelve las notas guardadas y el estado `BORRADOR`.                                                                                        |
| Un borrador no es visible para el profesor como pendiente de revisión.         | La evaluación queda en `BORRADOR` en `revision_notas`. Los pendientes del profesor (NOT-10) serán solo las evaluaciones en `EN_REVISION` (NOT-08). |

## Comportamiento

- En la tabla de notas del ayudante, debajo del título, se lee **"Estado: Borrador"**.
- **Guardar borrador** envía solo los campos que cambiaron, con las reglas de NOT-05 y NOT-06. Al guardar aparece "Borrador guardado.".
- Al cerrar y volver a abrir la evaluación, se recuperan las notas guardadas.
- **El profesor sigue leyendo los valores por la API** (GET, con `estado: 'BORRADOR'`), pero no los ve como pendientes: aún no hay vista de pendientes, y NOT-10 filtrará por `EN_REVISION`. El alumno no ve las propuestas ni el estado.

## API

`GET` y `PUT /api/espacio/secciones/:id/evaluaciones/:evaluacionId/notas` (NOT-05) devuelven además `estado` (`EstadoRevisionNotas` en `@cursus/shared`): `BORRADOR`, `EN_REVISION`, `APROBADA` o `DEVUELTA`. En NOT-07 siempre es `BORRADOR`.

- El estado se calcula en SQL: `LEFT JOIN revision_notas` con `COALESCE(r.estado, 'BORRADOR')`. **Una evaluación sin fila es un borrador.**
- El primer PUT exitoso crea la fila en `BORRADOR`, en la misma transacción y bajo el advisory lock de NOT-05, con `INSERT ... ON CONFLICT (evaluacion_id) DO NOTHING`. Los guardados siguientes no la cambian.
- Un PUT rechazado (nota inválida, alumno no inscrito, 403 o 404) no crea la fila.
- Los permisos no cambian: guarda solo el ayudante de la sección; leen el ayudante, el profesor y el Director.

## Datos

La migración `1792700000000-CrearRevisionNotas` crea `revision_notas`: `id`, `universidad_id`, `evaluacion_id` (único: una fila por evaluación), `estado`, `actualizado_por`, `created_at` y `updated_at`.

- FKs compuestas por universidad a `evaluacion` (con `uq_evaluacion_id_universidad` de NOT-04) y al usuario.
- `ck_revision_notas_estado`: los cuatro estados de NOT-09. Quién escribe cada uno lo decide la RLS.
- `GRANT SELECT, INSERT`, sin UPDATE ni DELETE: aún no hay transiciones.
- `tg_revision_notas_auditar_superadmin` (MT-04), como en `nota`.

**RLS** (ENABLE y no FORCE, como `nota`):

- Lectura igual que `nota`: el profesor y el ayudante de la universidad, y el Director en cualquiera. El alumno y el Administrativo no ven filas.
- Inserción: solo el rol `AYUDANTE`, en su universidad y con `estado = 'BORRADOR'`.

**Auditoría:** crear el borrador no deja evento en `nota_cambio`: es el estado inicial y no una transición. Cada nota sigue dejando su `PROPUESTA` (NOT-04).

## Lo que queda para las tarjetas siguientes

- **NOT-08 (enviar a revisión), [hecho](not-08-envio-revision.md):** política de UPDATE para que el ayudante pase de `BORRADOR` o `DEVUELTA` a `EN_REVISION`, con un evento `ENVIO`. El PUT responde 409 cuando el estado no es `BORRADOR` ni `DEVUELTA`, y la RLS de `nota` también lo exige al ayudante. "Enviar a revisión" va junto a "Guardar borrador".
- **NOT-11 y NOT-12 (aprobar y devolver), hechos ([NOT-11](not-11-aprobar-publicar.md), [NOT-12](not-12-devolver-envio.md)):** políticas de UPDATE del profesor desde `EN_REVISION`, con eventos `APROBACION` o `DEVOLUCION`. El comentario de la devolución va en `nota_cambio.motivo` y en `revision_notas.comentario_devolucion`.
- **NOT-10 (pendientes del profesor), [hecho](not-10-pendientes-revision.md):** las evaluaciones con `estado = 'EN_REVISION'`.

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
  - estado: una evaluación sin fila responde `BORRADOR` al ayudante, al profesor y al Director; una fila en `EN_REVISION` se lee como tal, así que el valor sale de la tabla;
  - borrador: guardar una sola nota crea la fila en `BORRADOR` y al volver se recupera; el guardado de otro ayudante no crea otra fila ni la cambia; solo quedan eventos `PROPUESTA`; el profesor lee los valores en `BORRADOR`;
  - una nota inválida, un alumno no inscrito, el profesor, un ayudante de otra sección y uno de otra universidad (404) no crean la fila;
  - dos PUT a la vez sobre una evaluación sin fila crean una sola fila;
  - privacidad: el alumno recibe 403 en el GET, y en sus endpoints no aparece `BORRADOR`;
  - restricciones: un estado fuera de NOT-09, una segunda fila de la evaluación y una evaluación de otra universidad se rechazan;
  - RLS como `cursus_app`: leen el profesor, el ayudante y el Director de otra universidad; el alumno, el Administrativo y otra universidad ven 0 filas; el profesor, el alumno, el Administrativo y el Director no insertan; el ayudante no inserta en `EN_REVISION`, `APROBADA` ni `DEVUELTA`, ni desde otra universidad; nadie puede hacer UPDATE ni DELETE.
- `backend/test/database/esquema-inicial.db-spec.ts` y `backend/test/multitenant/rls.db-spec.ts`: la migración se revierte primero; la tabla tiene RLS con `INSERT` y `SELECT` y el trigger del superadmin.
- `backend/test/notas/notas.e2e-spec.ts`: 401 sin sesión, y 403 por rol al guardar y al leer.
- `frontend/src/pages/NotasDeEvaluacion.test.tsx`: "Guardar borrador" guarda una sola nota con "Estado: Borrador" y "Borrador guardado.", y al cerrar y volver a abrir se recuperan las notas; el profesor no ve "pendiente", "borrador" ni "en revisión".

## Revisión en local

1. Ejecutar las migraciones y el seed de facultad completa. Levantar backend y frontend.
2. Como ayudante de una sección con una evaluación, abrir **Notas** e **Ingresar notas**: se lee "Estado: Borrador".
3. Escribir la nota de un solo alumno y pulsar **Guardar borrador**: aparece "Borrador guardado.".
4. Pulsar **Ocultar** y volver a abrir: la nota sigue ahí.
5. Como profesor de la sección, abrir **Notas**: la evaluación no aparece como pendiente de revisión.

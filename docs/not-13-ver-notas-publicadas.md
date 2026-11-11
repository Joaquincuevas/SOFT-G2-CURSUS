# NOT-13: el alumno ve sus notas publicadas

Tarjeta: [F4 · NOT-13](https://trello.com/c/JmrLsZAp). Depende de NOT-11 (aprobar y publicar), ya integrada en `develop`.

**Como** alumno, **quiero** ver mis notas publicadas del período, **para** conocer mis resultados.

## Criterios

| Criterio                                                                    | Cómo se cumple                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| El alumno ve, por curso, cada evaluación con su nota, fecha y ponderación.  | En la pestaña **Notas** de cada curso del período, el alumno ve **Mis notas**: una fila por evaluación con fecha, ponderación y nota, de `GET .../mis-notas`.                  |
| Solo aparecen notas `PUBLICADA`; las propuestas o devueltas no se muestran. | El endpoint solo une la nota si está `PUBLICADA` y activa, y la RLS (`pol_nota_lectura_alumno`) no deja leer otra cosa. Una evaluación sin nota publicada dice "Sin publicar". |
| El alumno solo ve sus propias notas, nunca las de otros.                    | El endpoint filtra por el usuario de la sesión y la RLS exige `alumno_id = usuario_actual()`. La respuesta no trae ids ni datos de otros alumnos.                              |

## Comportamiento

Como alumno, en **Mis cursos** → un curso → pestaña **Notas**:

- se ve **Mis notas**, con una tabla de columnas **Evaluación**, **Fecha**, **Ponderación** y **Nota**;
- las evaluaciones van por fecha, como en la lista del profesor;
- la nota se muestra con un decimal y coma (`5,0`); si aún no está publicada (sin nota, en borrador, en revisión o devuelta), se lee **Sin publicar**;
- sin evaluaciones, "Aún no hay evaluaciones";
- si falla la carga, "No pudimos cargar tus notas." con **Reintentar**.

El profesor y el ayudante siguen viendo la lista de evaluaciones de antes en esa pestaña. "Del período" lo dan los cursos: el alumno entra solo a las secciones del período activo desde su dashboard.

## API

`GET /api/espacio/secciones/:id/mis-notas`, como `mi-asistencia` (ASI-06). Responde `MisNotasSeccion` de `@cursus/shared`:

```json
{
  "evaluaciones": [
    {
      "evaluacionId": "…",
      "nombre": "Control 1",
      "fecha": "2026-09-01",
      "ponderacion": 20,
      "nota": 5
    },
    {
      "evaluacionId": "…",
      "nombre": "Solemne 1",
      "fecha": "2026-10-05",
      "ponderacion": 30,
      "nota": null
    }
  ]
}
```

| Resultado | Cuándo                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| **200**   | El alumno inscrito en la sección. Evaluaciones activas de la sección, por fecha; `nota` es `null` si no está publicada. |
| **403**   | El profesor, un ayudante o el Administrativo de la sección, o un alumno que no está inscrito en ella.                   |
| **404**   | La sección no existe, está archivada o es de otra universidad.                                                          |
| **401**   | Sin sesión.                                                                                                             |

Permisos:

- **CASL:** `@Puede('read', 'Seccion')`, como `mi-asistencia`. El alumno sigue sin `read Nota`: el GET de las notas de una evaluación (NOT-05) le responde 403.
- **Sección:** `IntegranteSeccionGuard`, y el servicio exige que el rol de la sesión y el de la sección sean `ALUMNO`.
- **Base:** la consulta corre como `cursus_app` con `fijarUsuario` (el alumno de la sesión) y la RLS nueva.

El código está en `backend/src/notas/mis-notas.controller.ts` y `mis-notas.service.ts`.

## Datos

La migración `1792810000000-LeerNotasAlumno` no crea tablas. Agrega **`pol_nota_lectura_alumno`** (SELECT de `nota`), solo para el rol `ALUMNO`:

```sql
universidad_id = universidad_actual() AND rol_actual() = 'ALUMNO'
AND estado = 'PUBLICADA' AND archived_at IS NULL
AND alumno_id = usuario_actual()
```

- Es permisiva: se suma con OR a `pol_nota_lectura`, que no cambia.
- `usuario_actual()` es de NOT-11. Sin `app.usuario_id` en la sesión, el alumno no ve ninguna fila.
- `ix_nota_alumno` (NOT-05) ya cubre la búsqueda por alumno.
- `down` quita la política.

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
  - `GET .../mis-notas`: cada evaluación activa con nombre, fecha y ponderación; la nota solo si está publicada, `null` si está propuesta en revisión, devuelta o sin nota; sin evaluaciones archivadas ni de otra sección; en el orden de la lista; sin datos de otros alumnos;
  - una sección sin evaluaciones responde `{ evaluaciones: [] }`;
  - el profesor, el ayudante, el Administrativo y un alumno no inscrito reciben 403; un alumno de otra universidad, 404; sin sesión, 401;
  - RLS como `cursus_app`: el alumno ve solo su nota publicada; no ve su propuesta ni su nota archivada; sin usuario en la sesión, desde otra universidad o con otro rol no ve ninguna fila.
- `backend/test/multitenant/rls.db-spec.ts`: las políticas con `usuario_actual()` incluyen `pol_nota_lectura_alumno`.
- `backend/test/database/esquema-inicial.db-spec.ts`: la migración se revierte primero y no deja la política.
- `backend/test/notas/notas.e2e-spec.ts`: 401 sin sesión y sin rutas de escritura en `mis-notas`.
- `frontend/src/pages/MisNotas.test.tsx`: el alumno ve las filas con su nota y "Sin publicar", sin formulario ni botones; el estado vacío; el error con reintento; el profesor sigue viendo la lista y no llama a `mis-notas`.

## Revisión en local

1. Levantar backend y frontend con las migraciones y el seed.
2. Como ayudante, ingresar y enviar las notas de una evaluación (NOT-08); como profesor, aprobarlas y publicarlas (NOT-11).
3. Como alumno, abrir el curso desde el dashboard → pestaña **Notas**: la evaluación publicada muestra su nota, fecha y ponderación; las otras, "Sin publicar".

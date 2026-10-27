# ASI-02: el profesor marca presente o ausente a cada alumno

Tarjeta: [F4 · ASI-02 Profesor marca presente o ausente a cada alumno](https://trello.com/c/UAa1mpbz). Referencia: RN-13. Depende de ASI-01 (clases), ya integrada en `develop`.

## Comportamiento

En la pestaña **Asistencia** de la vista de la sección (ASI-01), cada clase de la lista tiene un botón **Ver** que abre su asistencia debajo de la tabla.

- **Clase sin asistencia, profesor de la sección:** la lista de alumnos activos de la sección, por nombre, con una opción **Presente** o **Ausente** por alumno. Un contador indica cuántos faltan por marcar y **Guardar asistencia** queda deshabilitado mientras falte alguno. Al guardar, la asistencia queda registrada con la fecha y el profesor, y la vista pasa a solo lectura.
- **Clase con asistencia:** solo lectura, para todos los que la leen: cada alumno con Presente o Ausente y "Registrada por <profesor> el <fecha y hora>". Corregir una marca es ASI-04.
- **Clase sin asistencia, ayudante:** "Aún no se registra la asistencia de esta clase".
- **Sección sin alumnos inscritos:** lo indica y no hay nada que guardar.

Quién lee y quién guarda:

| Quién                                      | Lee | Guarda |
| ------------------------------------------ | --- | ------ |
| El profesor a cargo de la sección          | Sí  | Sí     |
| Los ayudantes de la sección                | Sí  | 403    |
| El Director (solo lectura, ADR 0001)       | Sí  | 403    |
| Los alumnos (ven la suya en ASI-06)        | 403 | 403    |
| El Administrativo de la facultad del curso | 403 | 403    |

La lista **no incluye correos**: también la lee el ayudante, que no ve correos de los alumnos (RE-10, igual que en ESP-05).

## API

| Método | Ruta                                                    | Cuerpo                                 | Resultado                       |
| ------ | ------------------------------------------------------- | -------------------------------------- | ------------------------------- |
| GET    | `/api/espacio/secciones/:id/clases/:claseId/asistencia` | Ninguno                                | 200, `AsistenciaClase`          |
| POST   | `/api/espacio/secciones/:id/clases/:claseId/asistencia` | `{ marcas: [{ alumnoId, presente }] }` | 201, `AsistenciaClase` guardada |

`AsistenciaClase` (`@cursus/shared`) es `{ clase, registrada: { por: { id, nombre }, en } | null, alumnos: { id, nombre, presente }[] }`:

- Sin asistencia: los alumnos **activos** de la sección (reutiliza `ALUMNOS_SECCION` de GES-18, sin el correo) con `presente: null`.
- Con asistencia: las **filas guardadas**, aunque un alumno ya no esté inscrito. La lista de una clase registrada no cambia cuando cambia la sección.

Guardar es `POST`, como crear una clase, un anuncio o una evaluación: crea la asistencia una sola vez y, si se repite, responde 409, así que no es idempotente como un `PUT`. `PUT` y `PATCH` quedan libres para corregir marcas (ASI-04); hoy responden 404.

El POST:

- 404 si la clase no existe, está archivada o es de otra sección.
- 403 si quien guarda no es el profesor de la sección (lo vuelve a comprobar dentro de la transacción, con la sección y la clase fijadas con `FOR SHARE`).
- **409** si la clase ya tiene asistencia: corregirla es ASI-04. También si dos guardados llegan a la vez (índice único).
- **400** si la sección no tiene alumnos inscritos, o si la lista no coincide exactamente con los alumnos activos: responde `{ message, faltantes, sobrantes, repetidos }` con los ids de cada caso.
- 400 por un cuerpo mal formado (sin `marcas`, `presente` no booleano, `alumnoId` que no es UUID o campos extra).
- La lista se valida contra las inscripciones activas **fijadas** con `FOR SHARE`: si el Administrativo quita a un alumno (GES-19) mientras se guarda, su acción espera a que termine el guardado. Un alumno inscrito después queda sin marca en esa clase. Los UUID se comparan en minúsculas.
- Todo se guarda en una sola transacción: una fila por alumno.

## Datos

La migración `1792580000000-CrearAsistencia` crea `asistencia`: `universidad_id`, `clase_id`, `alumno_id`, `presente`, `registrada_por`, `archived_at`, `created_at` y `updated_at`.

- FKs compuestas por universidad a `clase` (agrega `uq_clase_id_universidad`), al alumno y al profesor.
- Índice único `(clase_id, alumno_id) WHERE archived_at IS NULL`: una sola marca activa por alumno en cada clase. `archived_at` queda para ASI-04, que corregirá archivando la marca y dejando registro del cambio.
- RLS con el patrón de `clase`: lectura en la universidad, o en cualquiera para el Director; inserción y modificación solo en la universidad y con rol `PROFESOR`. `GRANT SELECT, INSERT, UPDATE` (UPDATE para archivar en ASI-04), sin DELETE.
- Nuevo sujeto `Asistencia` en `shared/src/permisos.ts`, con los mismos lectores que `Clase`.

## Verificación

Desde la raíz, con Node 24.15+, dependencias instaladas y PostgreSQL disponible:

```bash
npm run lint
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
npm run build
```

- `backend/test/asistencia/asistencia.db-spec.ts`: lectura sin asistencia (orden, sin correo); guardado válido con fecha y profesor; 409 al guardar dos veces; 400 por faltante, sobrante (no inscrito o con la inscripción archivada), repetido, lista vacía, sección sin alumnos y cuerpo mal formado; 404 por clase de otra sección, archivada o inexistente; 403 al guardar para alumno, ayudante, Administrativo, Director y profesor de otra sección, 404 para otra universidad; lectura según los roles; que una clase registrada siga mostrando a un alumno que se retiró después; RLS y sin DELETE.
- `backend/test/asistencia/clases.e2e-spec.ts`: 401, 403 por CASL y sin ruta DELETE.
- `frontend/src/pages/AsistenciaDeClase.test.tsx`: Guardar deshabilitado hasta marcar a todos y el cuerpo enviado; solo lectura para profesor y ayudante; el ayudante no marca; sección sin alumnos; 409; error con reintento.

## Revisión en local

1. Ejecutar las migraciones y el seed de facultad completa. Levantar backend y frontend.
2. Ingresar con `camila.rojas@norte.cursus.test` y la contraseña `SEED_PASSWORD` del `.env`. Abrir una sección, la pestaña **Asistencia**, registrar una clase y pulsar **Ver**.
3. Marcar a algunos alumnos: **Guardar asistencia** sigue deshabilitado. Marcar a todos y guardar: la vista pasa a solo lectura con "Registrada por Camila Rojas…".
4. Volver a abrir la clase: sigue en solo lectura. Un POST directo responde 409.
5. Ingresar como un ayudante de esa sección: ve la asistencia registrada, pero no puede marcar una clase sin asistencia.

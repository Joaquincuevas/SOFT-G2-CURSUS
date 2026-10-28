# MAT-08: el profesor crea una actividad de entrega con plazo

Tarjeta: [F4 · MAT-08 Profesor crea una actividad de entrega con plazo](https://trello.com/c/vGEIsgI8). Referencia: RN-08. Sin dependencias dentro de la fase.

## Comportamiento

El profesor de una sección crea actividades de entrega con título, instrucciones y fecha y hora límite. Los integrantes de la sección las ven con su plazo y su estado: **Abierta** mientras el plazo no pasa y **Cerrada** después.

La actividad es **de la sección**, como una evaluación (NOT-01): la crea su profesor y la ven sus integrantes. Esta tarjeta solo crea y lista actividades. Las entregas de los alumnos son MAT-09 y su descarga es MAT-10.

| Quién                                      | Lee | Crea |
| ------------------------------------------ | --- | ---- |
| El profesor a cargo de la sección          | Sí  | Sí   |
| Ayudantes y alumnos de la sección          | Sí  | No   |
| El Administrativo de la facultad del curso | 403 | 403  |
| El Director                                | Sí  | No   |
| Cualquier otro usuario de la universidad   | 403 | 403  |

Quién entra al espacio de una sección lo decide el guard de ESP-06; ver [ESP-06](esp-06-acceso-seccion.md). El Administrativo pasa ese guard, pero, igual que en NOT-01, ASI-01 y ANU-01, no recibe permisos sobre las actividades.

### Plazo y estado

- La fecha y la hora límite se ingresan en **hora de Chile continental** (`ZONA_HORARIA_UNIVERSIDAD`). El backend las convierte con `AT TIME ZONE 'America/Santiago'` y guarda el instante en `timestamptz`, así que el resultado no depende de la zona horaria del navegador.
- El plazo debe ser **posterior a la hora actual**, y su fecha debe estar **dentro del período del curso**, como la fecha de una evaluación.
- **Cerrada se calcula, no se guarda:** la API devuelve `cerrada = plazo <= now()` según la hora del servidor. Una actividad se cierra sola al pasar el plazo, sin tareas programadas, y MAT-09 puede rechazar entregas con la misma regla.

## Pantalla

La vista de la sección (ESP-04) suma la pestaña **Entregas** (`PestanaEntregas`), al final de la barra, con el bloque **Actividades de entrega**. Las actividades se muestran por plazo, la más próxima primero. Cada una muestra su título, la etiqueta Abierta o Cerrada, el plazo en hora de Chile (por ejemplo, "Plazo: 14-11-2026, 23:59") y las instrucciones con sus saltos de línea. Sin actividades, dice "Aún no hay actividades de entrega".

El profesor de la sección ve además el formulario **Nueva actividad**: Título, Instrucciones, Fecha límite y Hora límite, todos obligatorios, con el aviso de que la hora es de Chile continental. Al crear una actividad, el formulario se limpia, aparece "Actividad creada" y la lista se actualiza. Un 400 muestra el mensaje de la API (por ejemplo, que el plazo ya pasó) y conserva lo escrito.

La pestaña usa el mismo mecanismo que las otras (`CONTENIDO` en `VistaSeccion.tsx`, con `PropsPestana`). Va aparte de **Material**, como en el Figma: Material es para los archivos del curso (sílabo y materiales, MAT-02 y MAT-04) y sigue deshabilitada. El Figma llama a esta pestaña "Entregar Trabajo" en la vista del alumno; aquí se usa "Entregas" para todos los roles. MAT-09 y MAT-10 agregarán aquí las entregas y su descarga.

## API

| Método | Ruta                                     | Cuerpo                                   | Resultado                            |
| ------ | ---------------------------------------- | ---------------------------------------- | ------------------------------------ |
| GET    | `/api/espacio/secciones/:id/actividades` | Ninguno                                  | 200, `Actividad[]` activas por plazo |
| POST   | `/api/espacio/secciones/:id/actividades` | `{ titulo, instrucciones, fecha, hora }` | 201, la `Actividad` creada           |

`Actividad` (`@cursus/shared`) es `{ id, titulo, instrucciones, plazo, cerrada }`, con `plazo` en ISO 8601. `fecha` va como `YYYY-MM-DD` y `hora` como `HH:mm`.

- 400:
  - un campo ausente o que no es texto;
  - título o instrucciones de solo espacios;
  - título de más de 100 caracteres o instrucciones de más de 2000;
  - caracteres de control (PostgreSQL rechaza el NUL y respondería 500);
  - fecha u hora con otro formato o inexistentes;
  - campos extra, o un id que no es UUID;
  - plazo que ya pasó ("La fecha y hora límite deben ser posteriores a la hora actual");
  - fecha fuera del período del curso (el mensaje incluye el rango).
- El título se guarda en una línea, sin espacios repetidos. Las instrucciones conservan sus saltos de línea y tabulaciones. Los dos se guardan sin espacios al inicio ni al final.
- 401 sin sesión.
- 403 al crear: alumno, ayudante, Administrativo, Director, o un profesor que no está (o dejó de estar) a cargo de esa sección. 403 al leer: el Administrativo, o quien no es integrante de la sección.
- 404: la sección no existe, está archivada o es de otra universidad.

Los permisos van en `shared/src/permisos.ts`, con el mismo formato que NOT-01: el sujeto nuevo `Actividad` da `create` al profesor y `read` al profesor, el ayudante, el alumno y el Director. Las dos rutas llevan además `@IntegranteDeSeccion()` y revisan el rol del usuario en la sección. El `INSERT` vuelve a exigir que el profesor siga a cargo de la sección y que la sección y su curso sigan vigentes. Si no, responde 403 o 404.

## Base de datos

La migración `CrearActividad` (`1792610000000`) crea la tabla `actividad`:

- `seccion_id`, `titulo`, `instrucciones`, `plazo` (`timestamptz`), `creada_por`, `archived_at`, `created_at` y `updated_at`.
- FKs compuestas `fk_actividad_seccion` y `fk_actividad_creada_por`: la sección y el profesor son de la misma universidad que la actividad.
- `ck_actividad_titulo` (1 a 100 caracteres, sin espacios al inicio ni al final) y `ck_actividad_instrucciones` (1 a 2000 caracteres sin contar los espacios de los extremos).
- Índice `ix_actividad_seccion_plazo` para el listado de una sección.
- RLS con el patrón de `evaluacion`: cada universidad lee sus actividades y el Director las de todas. Solo el rol `PROFESOR` inserta o modifica, en su universidad. MAT-08 no expone ningún `UPDATE`: la política queda para archivar o editar más adelante. Sin `DELETE`.

## Revisión en local

Con los datos del seed (GES-20), el curso ICC101 de Ingeniería Norte tiene dos secciones con profesores distintos. La contraseña de todos es `SEED_PASSWORD` de `.env` (`cursus_demo` con el ejemplo).

1. `docker compose up -d --wait`, `npm run migration:run --workspace=backend` y `npm run seed --workspace=backend`. En dos terminales, `npm run dev:back` y `npm run dev:front`, y abrir `http://localhost:5173`.
2. Ingresar con `matias.munoz@norte.cursus.test` (profesor de ICC101 sección 2). En el Dashboard, abrir ICC101 sección 2 y la pestaña **Entregas**.
3. Crear una actividad con una fecha de ayer: aparece el error de que el plazo ya pasó y el formulario conserva lo escrito.
4. Crear una actividad con instrucciones de dos líneas y un plazo en unos días: aparece "Actividad creada" y la actividad queda en la lista como **Abierta**, con el plazo en hora de Chile y los dos renglones.
5. Crear otra con un plazo dentro de un par de minutos. Esperar a que pase y volver a abrir la pestaña: aparece como **Cerrada**.
6. Cerrar sesión e ingresar con `constanza.castro@norte.cursus.test` (alumna de la sección 2) y con `sofia.contreras@norte.cursus.test` (ayudante de la sección 2). En ICC101 sección 2, pestaña **Entregas**: ven las actividades, sin formulario.
7. Ingresar con `camila.rojas@norte.cursus.test` (profesora de la sección 1). En ICC101 sección 1 no aparece ninguna de esas actividades.

## Pruebas automáticas

```bash
npm run lint
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
npm run build
```

- `backend/test/materiales/actividades.db-spec.ts`, con PostgreSQL real en una base propia:
  - crear con título, instrucciones y plazo, y que el plazo sea el instante de esa fecha y hora en Santiago;
  - aceptar el último día del período;
  - los 400 de cada campo (incluidos los caracteres de control), del plazo pasado y de la fecha fuera del período;
  - los 403 y 404 de quién no crea ni lee;
  - la lista por plazo, con `cerrada: true` para una actividad vencida, sin las archivadas, y que la lean el ayudante, el alumno y el Director;
  - en la base: RLS aísla las actividades por universidad y solo deja insertar al profesor (con control positivo), los CHECK rechazan título o instrucciones vacíos, y no hay `DELETE` ni ruta para borrar.
- `backend/test/materiales/actividades.e2e-spec.ts`: 403 al crear por rol, 403 al leer para el Administrativo, 401 sin sesión, 400 con un id inválido y sin ruta `DELETE`.
- `frontend/src/pages/PestanaEntregas.test.tsx`: la lista con el plazo en hora de Chile, la etiqueta Abierta o Cerrada y los saltos de línea; crear, el aviso y la recarga; el mensaje del 400; la lista sin formulario para el ayudante y el alumno; el estado vacío y el error de carga. `VistaSeccion.test.tsx` comprueba que la pestaña Entregas aparece al final y queda habilitada, y que Material sigue deshabilitada.
- `src/auth/permisos.spec.ts` incluye `Actividad` en la matriz; `esquema-inicial.db-spec.ts` revierte la migración nueva, y `rls.db-spec.ts` agrega la tabla al contrato del schema.

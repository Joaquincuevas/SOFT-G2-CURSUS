# GES-12: asignar el profesor de una sección

Tarjeta: [GES-12](https://trello.com/c/eQz4gcJe). Referencia: RN-05. Depende de GES-09.

## Comportamiento

En el detalle de un curso, el administrativo ve una columna **Acciones** con el botón **Asignar profesor** en cada sección, o **Cambiar profesor** si la sección ya tiene uno. El botón abre un formulario bajo la tabla con la lista de profesores.

La lista trae los profesores de la universidad del administrativo, de todas sus facultades, sin los archivados. La tarjeta pide los de la universidad, así que un administrativo de Economía puede asignar a un profesor de Ingeniería.

Una sección tiene a lo más un profesor a cargo. Si ya tiene uno, guardar pide confirmar el reemplazo ("La sección 1 ya tiene a Camila Rojas como profesor a cargo. ¿Reemplazarlo por Matías Muñoz?"). **Volver** cancela sin guardar; **Reemplazar** guarda. Al guardar, la tabla muestra al profesor nuevo y un aviso de éxito, sin volver a pedir el curso.

El Director ve el profesor de cada sección en el detalle, en solo lectura y sin la columna Acciones. El resto de los roles no entra a Gestión académica.

## API y permisos

| Método | Ruta                          | Cuerpo           | Resultado                                      |
| ------ | ----------------------------- | ---------------- | ---------------------------------------------- |
| GET    | `/api/profesores`             | Ninguno          | 200, `[{ id, nombre }]` ordenados por nombre   |
| PUT    | `/api/secciones/:id/profesor` | `{ profesorId }` | 200, la sección (`SeccionDetalle`) actualizada |
| GET    | `/api/cursos/:id`             | Ninguno          | Cada sección trae `profesor` (nombre o `null`) |

Las dos rutas nuevas piden `update` sobre `Seccion`, que hoy solo tiene el administrativo: la lista existe para asignar, así que solo la ve quien puede hacerlo.

- Sin sesión: 401. Director, profesor, ayudante o alumno: 403.
- `profesorId` ausente o que no es UUID, campos extra, o un id de sección que no es UUID: 400.
- La misma respuesta 404 ("La sección o el profesor no existen"), sin cambiar nada, si:
  - la sección no existe, está archivada, o es de un curso archivado, de otra facultad o de otra universidad;
  - el profesor no existe, es de otra universidad, no tiene el rol PROFESOR o está archivado.

## Base de datos

La migración `AsignarProfesorSeccion` agrega a `seccion` la columna `profesor_id`. Al ser una sola columna, "un solo profesor a cargo" lo garantiza la estructura, y reasignar reemplaza al anterior.

La FK compuesta `fk_seccion_profesor`, sobre `(profesor_id, universidad_id)`, impide en la base que el profesor sea de otra universidad, igual que las de curso con carrera y período. Para eso la migración agrega `uq_usuario_id_universidad` a `usuario`. Que el usuario tenga el rol PROFESOR y no esté archivado lo verifica `GestionService.asignarProfesor`, en la misma consulta que actualiza la sección.

El índice `ix_seccion_profesor` cubre la FK y las búsquedas futuras de las secciones de un profesor. La migración solo agrega una columna que admite `NULL`, una restricción y un índice, así que es compatible hacia atrás.

## Preparación

Desde la raíz del repositorio:

```bash
git fetch origin
git switch feature/gestion-asignar-profesor
npm ci
docker compose up -d --wait
npm run migration:run --workspace=backend
npm run seed --workspace=backend
# En dos terminales:
npm run dev:back
npm run dev:front
```

## Pasos para el reviewer

1. Ingresar con `administrativo.ingenieria@norte.cursus.test` y la contraseña `SEED_PASSWORD` de `.env`. Abrir Cursos y entrar a `ICC101`.
2. En la sección 1, **Asignar profesor**. La lista debe traer solo profesores de Universidad Demo Norte, incluidos los de Economía. Elegir uno y **Guardar**: la tabla lo muestra, con el aviso de éxito, y el botón pasa a **Cambiar profesor**.
3. **Cambiar profesor** en la misma sección, elegir otro y **Guardar**: aparece la confirmación. **Volver** no guarda nada; **Guardar** y luego **Reemplazar** guarda al nuevo. Recargar la página para confirmar que quedó guardado.
4. Ingresar con `director@norte.cursus.test`, abrir el mismo curso: se ve el profesor asignado, sin la columna Acciones.
5. Ingresar con `administrativo@sur.cursus.test`: la lista de profesores no trae a nadie de Norte.

## Pruebas automáticas

```bash
npm run lint
npm test
npm run test:db --workspace=backend
npm run test:e2e --workspace=backend
npm run build
```

- `backend/test/gestion/asignar-profesor.db-spec.ts`, con PostgreSQL real en una base propia: la lista por universidad (con las dos facultades de Norte, sin los de Sur, sin archivados ni otros roles), la asignación vista en el detalle por el administrativo y el Director, el reemplazo con un solo profesor, los 404 y que la base rechaza un profesor de otra universidad aunque no pase por la API.
- `backend/test/gestion/asignar-profesor.e2e-spec.ts`: 401, 403 por rol y 400 por body o id inválidos.
- `frontend/src/pages/CursoDetalle.test.tsx`: el profesor en el detalle, asignar, la confirmación al reasignar (y que Volver no guarda), cancelar, el mensaje del 404 y el error al cargar la lista. Los tests de GES-08 se ajustaron a la columna Acciones.

# MAT-02: sílabo PDF del curso con historial

## Comportamiento

El profesor asignado a una sección puede cargar un PDF desde la pestaña **Material**. El sílabo pertenece al curso, que ya está asociado a un período académico; no se guarda una relación con la cuenta del profesor que lo cargó. Cada carga crea una versión nueva y conserva las anteriores. El profesor, los ayudantes y los alumnos de las secciones del curso pueden consultar el historial y descargar cualquier versión. El Director puede leerlo en solo lectura; el Administrativo no accede al material.

Se aceptan PDF de hasta 10 MiB. El servidor comprueba el tipo MIME y la firma `%PDF-`; la base también limita el tamaño. Los bytes se guardan en PostgreSQL (`bytea`), ya que este proyecto aún no tiene un bucket ni integración S3 configurados.

## API

Las rutas usan el id de una sección para aplicar el control de acceso de ESP-06; el recurso se resuelve por el curso de esa sección.

| Método | Ruta                                         | Resultado                                                                         |
| ------ | -------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET`  | `/api/espacio/secciones/:id/silabo`          | Versiones del curso, de la más reciente a la más antigua (`version`, `subidoEn`)  |
| `GET`  | `/api/espacio/secciones/:id/silabo/:version` | Descarga del PDF de esa versión                                                   |
| `POST` | `/api/espacio/secciones/:id/silabo`          | Recibe multipart con el campo `archivo`; crea la siguiente versión y responde 201 |

El profesor debe estar asignado a la sección usada para cargar. Ayudantes y alumnos necesitan ser integrantes de la sección para leer. Una sección distinta del mismo curso presenta el mismo historial porque las versiones están asociadas al curso y no a la sección.

## Base de datos

La migración `CrearSilabo` crea `silabo` con `curso_id`, `universidad_id`, número de versión, bytes PDF y fecha de carga. La FK compuesta asegura que el curso pertenece a la misma universidad. La unicidad `(curso_id, version)` y un bloqueo del curso serializan las cargas concurrentes. No se guarda `subido_por`. Las versiones son de solo adición: la API y el rol `cursus_app` no tienen permisos de modificación ni borrado.

RLS restringe la lectura a la universidad, con lectura global de solo lectura para el Director; solo el rol `PROFESOR` puede insertar. El servicio vuelve a comprobar dentro de la transacción que el profesor sigue asignado a la sección y que el curso no está archivado.

## Revisión

Con PostgreSQL local levantado, aplicar migraciones y seed, ejecutar backend y frontend, e ingresar con usuarios de demo:

1. Como profesor de una sección, abrir el curso y la pestaña **Material**. Cargar un PDF; debe aparecer la versión 1.
2. Cargar otro PDF; debe aparecer la versión 2 y conservarse la versión 1 en el historial.
3. Como alumno de una sección del curso, descargar ambas versiones. No debe aparecer un formulario de carga.
4. Probar un archivo no PDF, un profesor no asignado, un usuario que no pertenece a la sección y una cuenta de otra universidad; deben rechazarse.
5. Ejecutar `npm run test:db --workspace=backend` para comprobar versionado, descarga, autorización y RLS con PostgreSQL real.

# MAT-07: el profesor sube una versión nueva de un material

Tarjeta: [MAT-07](https://trello.com/c/bToV1eBJ). Depende de MAT-04 (materiales), MAT-06 (descarga), MAT-01 (archivos en S3), MAT-02 (patrón de versiones del sílabo) y GES-25 (varios profesores por sección).

**Como** profesor, **quiero** subir una versión nueva de un material sin perder la anterior, **para** corregirlo sin borrar lo que ya se publicó.

## Criterios de aceptación

| Criterio                                                                         | Implementación y pruebas                                                                                                                                                                                           |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Al subir una versión nueva, los alumnos ven y descargan siempre la más reciente. | El listado y la descarga de MAT-06 usan la versión de mayor número y firman su `version_objeto`. La RLS de `material_version` solo deja leer la vigente a quien no es profesor del curso, también con SQL directo. |
| Las versiones anteriores quedan guardadas con su fecha y quién las subió.        | Tabla `material_version` de solo adición (sin `UPDATE` ni `DELETE`), con `subido_por` y `subido_en` (`clock_timestamp()`).                                                                                         |
| El profesor puede ver y descargar las versiones anteriores.                      | `GET …/versiones` y `GET …/versiones/:version/descarga`, solo para el profesor. En la pestaña Material, **Historial de versiones** con fecha, responsable y **Descargar**.                                         |

## Quién puede

| Quién                                                            | Sube versión | Historial y versiones anteriores | Vigente             |
| ---------------------------------------------------------------- | ------------ | -------------------------------- | ------------------- |
| Cualquier profesor vigente del curso (no solo quien lo registró) | Sí           | Sí                               | Sí                  |
| Ayudante y alumno de una sección del curso                       | No (403)     | No (403)                         | Sí                  |
| Director                                                         | No (403)     | No (403)                         | Sí, en solo lectura |
| Administrativo, profesor de otro curso u otra universidad        | No           | No                               | No                  |

## API

- `POST /api/espacio/secciones/:id/materiales/:materialId/versiones` con `{ archivoId }` (`SubirVersionMaterial`). El archivo pasó antes por la subida y confirmación de MAT-01 en una sección del curso.
  - 201 con `VersionMaterial` (`version`, `archivo`, `subidoEn`, `responsable`).
  - Reintentar con el mismo archivo devuelve la versión ya registrada (201), sin crear otra.
  - 400 si el archivo no existe, es ajeno, está archivado, sin confirmar, es de otro curso o es un sílabo publicado, o si el objeto de S3 no calza con el tipo y el tamaño confirmados.
  - 403 sin `create MaterialVersion` (CASL) o si el rol en la sección no es `PROFESOR`.
  - 404 si el material no es del curso o está archivado.
  - 409 si el archivo ya es otro material o una versión de otro.
  - 503 si el bucket no tiene versionado (no hay `VersionId` que fijar).
- `GET …/materiales/:materialId/versiones`: 200 con `VersionMaterial[]`, de la más reciente a la más antigua. Solo profesor.
- `GET …/materiales/:materialId/versiones/:version/descarga`: 200 con `DescargaArchivo`, firmada con el `VersionId` de esa versión y `Cache-Control: no-store`. Solo profesor; 404 si la versión no existe.
- `GET …/materiales` ahora agrega `version` y `versionEn` (fecha de la vigente); `archivo` es el de la vigente y `creadoEn` sigue siendo la fecha del material.

La numeración toma `FOR UPDATE` del material, así dos profesores que suben a la vez obtienen versiones consecutivas.

## Base de datos

Migración `CrearMaterialVersion1792890000000`:

- Tabla `material_version` con `UNIQUE (material_id, version)`, `archivo_id` único y FKs compuestas con `universidad_id` (agrega `uq_material_id_universidad` a `material` para la FK).
- **Backfill**: una versión 1 por cada material existente, con su `archivo_id`, `subido_por` y `created_at`. `material.archivo_id` se mantiene como el archivo de la versión 1, así MAT-04 y MAT-06 no cambian de forma.
- **`version_objeto` de la versión 1 migrada**: una migración no puede leer S3, así que solo esa fila puede quedar `NULL` (`CHECK (version_objeto IS NULL AND version = 1 OR …)`), y la política de `INSERT` exige el valor en toda versión nueva, incluida la 1 que ahora registra MAT-04. Esas versiones migradas se firman sin `VersionId`, es decir, la última del objeto. Se eligió así y no un valor inventado porque la clave de cada archivo es única y la aplicación nunca la sobrescribe: la última versión del objeto es la que se confirmó.
- **RLS** (`ENABLE`, `GRANT SELECT, INSERT`, sin `DELETE`):
  - `INSERT`: rol `PROFESOR`, `subido_por = usuario_actual()`, `es_profesor_de_seccion` sobre una sección vigente del curso del material, el número siguiente a la vigente y un archivo propio, confirmado, vigente, de una sección del curso y que no sea sílabo (`es_archivo_silabo`).
  - `SELECT`: quien ve el material (su RLS: integrantes del curso y el Director) ve la vigente; el profesor del curso, todas. La vigente se calcula con `material_version_vigente(uuid)`, `SECURITY DEFINER`, porque una política no puede consultar su propia tabla.
  - `tg_material_version_auditar_superadmin` registra en `superadmin_cambio`.
- **`pol_material_modificacion`**: el `USING` ya no exige `subido_por = usuario_actual()`, para que cualquier profesor del curso pueda tomar el `FOR UPDATE`. El `WITH CHECK` no cambia, así que solo quien registró el material lo modifica (lo prueba un test con 42501). El `GRANT UPDATE` se mantiene porque `FOR UPDATE` lo necesita.

## Interfaz

En **Mis cursos → sección → Material**, cada material muestra "Versión N, del _fecha_ · Publicado el _fecha_". Solo el profesor ve, bajo cada material:

- **Nueva versión** y **Subir nueva versión**: pide la subida, sube a S3 con progreso, confirma y registra. Si falla a mitad, muestra el motivo (`role="alert"`) y el botón se desbloquea siempre, en un `finally`. Al reintentar con el mismo archivo ya confirmado no lo sube otra vez.
- **Historial de versiones** (se carga al abrirlo): número, fecha y hora, responsable, nombre del archivo y **Descargar**.

## Pruebas

- `backend/test/materiales/materiales.db-spec.ts`, bloque MAT-07:
  - API: co-profesor y profesor de otra sección suben la versión 2; el alumno lista y descarga la v2 con su `VersionId`; el profesor ve el historial y descarga la v1; 403 para ayudante y alumno; reintento idempotente; 409; numeración con tres subidas simultáneas; sílabo rechazado; 400 por objeto distinto y 503 sin versionado; versión 1 migrada sin `VersionId`; backfill (corre `down` y `up` de la migración en una transacción).
  - SQL directo: el co-profesor inserta; ayudante, alumno, profesor de otro curso, otra universidad y un número salteado reciben 42501; ayudante, alumno y Director leen solo la vigente y el profesor todas; sin `UPDATE` ni `DELETE`; auditoría del superadmin.
- `backend/test/materiales/versiones-material.e2e-spec.ts`: 201, 200, 400, 403 (CASL y rol en la sección) y 409.
- `frontend/src/pages/PestanaMaterial.test.tsx`: versión nueva, historial con descarga, error de S3 a mitad del flujo, 409 y que ayudante y alumno no ven el formulario ni el historial.

## Revisión manual con LocalStack

1. Como profesor, sube un material (v1) y luego **Subir nueva versión** con otro archivo (v2).
2. Como alumno, la pestaña dice "Versión 2" y **Descargar** entrega el archivo de la v2.
3. Como profesor, abre **Historial de versiones** y descarga la v1: llega el contenido original.

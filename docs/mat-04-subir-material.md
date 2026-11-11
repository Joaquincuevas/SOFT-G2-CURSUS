# MAT-04: el profesor sube un material con su categoría

Tarjeta: [MAT-04 Profesor sube un material con su categoría](https://trello.com/c/OmlcRtrZ). Depende de MAT-01 (archivos en S3) y de GES-25 (varios profesores por sección). El listado y la descarga para el resto de los integrantes son MAT-05 y MAT-06.

**Como** profesor, **quiero** subir un material con su categoría, **para** que mis alumnos y el próximo profesor del curso lo tengan.

## Criterios

| Criterio                                                                         | Cómo se cumple                                                                                                                                     |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Al subir se elige una categoría: guía, presentación, prueba anterior o código.   | `categoria` (`CATEGORIAS_MATERIAL` de `@cursus/shared`) es obligatoria, con CHECK en la base.                                                      |
| El material tiene título y una descripción opcional.                             | `titulo` (1 a 100 caracteres) y `descripcion` (opcional, hasta 1000), con CHECK en la base.                                                        |
| Queda asociado al curso, no al profesor, para que lo herede el próximo profesor. | `material.curso_id`: cualquier profesor vigente de cualquier sección del curso, en ese período, lo ve (GES-25). Ver **Herencia** y **Pendientes**. |

## Comportamiento

El material **no guarda bytes**: referencia un archivo de MAT-01 ya confirmado en S3. Subirlo son cuatro pasos, y la pestaña **Material** de la sección los hace en orden:

1. **Pedir la subida** (`POST .../archivos`, MAT-01): el backend registra el archivo sin confirmar y firma un POST directo a S3.
2. **Subir a S3**: el navegador envía el archivo a la URL firmada, con progreso.
3. **Confirmar** (`POST .../archivos/:archivoId/confirmar`, MAT-01): el backend revisa que el objeto esté en S3 con el tamaño y el tipo registrados.
4. **Registrar el material** (`POST .../materiales`, MAT-04): el material se asocia al curso de la sección.

No se duplica la subida: MAT-04 no firma ni toca S3, solo exige que el archivo de MAT-01 esté confirmado.

| Quién en la sección                     | Sube y lista materiales             |
| --------------------------------------- | ----------------------------------- |
| Profesor (cualquiera de los vigentes)   | Sí                                  |
| Ayudante                                | 403                                 |
| Alumno                                  | 403                                 |
| Administrativo de la facultad del curso | 403                                 |
| Director                                | 403                                 |
| Quien no es integrante de la sección    | 403 (404 si es de otra universidad) |

### Herencia: qué significa "lo hereda el próximo profesor"

Decisión de esta tarjeta: **heredar** es que cualquier profesor vigente de **cualquier sección del curso, en ese período**, ve y gestiona el material (GES-25: `es_profesor_de_seccion`). Un curso es de un solo período (`curso.periodo_id`), así que el material de ICC101 de 2026-2 lo ven el profesor de la sección 1, el de la sección 2 y cualquiera que se asigne después a una de ellas. Si el profesor que lo subió deja la sección, el material sigue siendo del curso.

**La herencia entre períodos no existe todavía**: el curso del semestre siguiente es otra fila de `curso`, sin materiales. Ver **Pendientes**.

## API

Rutas del espacio de la sección (ESP-06: `@IntegranteDeSeccion()`), con `@Puede('create' | 'read', 'Material')`. Solo el profesor de la sección, según su rol en ella.

- `POST /api/espacio/secciones/:id/materiales` con `{ archivoId, categoria, titulo, descripcion? }`: responde 201 con el `Material` (`id`, `categoria`, `titulo`, `descripcion`, `archivo` y `creadoEn`).
  - 400 si el `archivoId` no es un UUID, la categoría no es una de las cuatro, el título está vacío o pasa de 100 caracteres, la descripción pasa de 1000, hay caracteres de control o un campo extra. El título se recorta y colapsa los espacios; una descripción vacía equivale a no enviarla.
  - 400 si el archivo **no existe** o no es de esta sección (de otra sección o curso, de otra universidad, o subido por otra persona), está archivado o **no está confirmado**.
  - 403 si no es el profesor de la sección, o si dejó la sección durante la petición.
  - 409 si el archivo ya es un material (también si dos peticiones lo registran a la vez: gana una).
- `GET /api/espacio/secciones/:id/materiales`: lo mínimo para que el profesor vea lo que subió. Devuelve `Material[]` con los materiales activos del **curso** (no solo los de su sección), del más reciente al más antiguo. El listado para los demás integrantes es de MAT-05.

Permisos (CASL, `Material`): el profesor tiene `create` y `read`; nadie más recibe nada. Nadie tiene `delete`.

## Datos

La migración `1792860000000-CrearMaterial` crea `material`:

| Columna       | Detalle                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `curso_id`    | Curso del material (FK compuesta por universidad)                                               |
| `archivo_id`  | Archivo de MAT-01 (FK compuesta por universidad). **Único**: un archivo es de un solo material. |
| `categoria`   | `GUIA`, `PRESENTACION`, `PRUEBA_ANTERIOR` o `CODIGO` (CHECK)                                    |
| `titulo`      | De 1 a 100 caracteres, sin espacios al borde (CHECK)                                            |
| `descripcion` | `NULL` o de 1 a 1000 caracteres, sin espacios al borde (CHECK)                                  |
| `subido_por`  | Quién lo registró (FK compuesta por universidad)                                                |
| `archived_at` | Nada se elimina: un material se archiva                                                         |

La FK compuesta a `archivo` usa `uq_archivo_id_universidad`, que crea `CrearEntrega` (MAT-09, `1792840000000`); por eso esta migración va después y no la crea ni la quita.

- **El archivo se valida en un trigger** (`tg_material_validar`, `validar_material()`), porque un CHECK no consulta otras tablas. Al registrar, el archivo debe estar **confirmado** (`subido_at`), no archivado, ser **de una sección de ese curso** y haberlo subido quien registra el material. Si no, `23514`. Después de registrado, el curso, el archivo y `subido_por` no cambian. El trigger corre antes que la política de `INSERT`, así que un archivo que no calza se rechaza con `23514` aunque el rol tampoco pueda escribir.
- **RLS** (`ENABLE`; sin `DELETE` para `cursus_app`):
  - `INSERT` y `UPDATE`: rol `PROFESOR` de la universidad, `subido_por = usuario_actual()` y `es_profesor_de_seccion` sobre alguna sección vigente del curso. La API fija el usuario con `fijarUsuario` antes de escribir, así que nadie registra un material a nombre de otro, ni con SQL directo.
  - `SELECT`: integrantes (profesor, ayudante o alumno vigentes) de cualquier sección del curso, y el Director en todas las universidades. La privacidad está en la política, no solo en la API: sin usuario fijado, no se ve nada.
- **Auditoría del superadmin** (MT-04): `tg_material_auditar_superadmin`.

## Pantalla

La pestaña **Material** (`PestanaMaterial`) de la vista de la sección solo está habilitada para el profesor (`SOLO_PROFESOR` en `VistaSeccion.tsx`; MAT-05 y MAT-06 la abrirán al resto). Muestra:

- el formulario **Subir material**: **Archivo** (solo los tipos de MAT-01, hasta 20 MB), **Categoría**, **Título** y **Descripción (opcional)**;
- los **materiales del curso**, con título, categoría, descripción y archivo con su tamaño. Sin materiales, "Aún no hay materiales del curso".

Al enviar, valida en el navegador lo que el backend también valida (archivo, tipo, tamaño, categoría y título) y avisa sin pedir nada. Después corre el flujo y muestra cada paso (`role="status"`): "Preparando la subida…", "Subiendo archivo… 40 %" con una barra de progreso, "Confirmando el archivo…" y "Registrando el material…". Al terminar, "Material subido", el formulario queda vacío y la lista se actualiza.

**Si falla a mitad**, muestra el motivo (`role="alert"`) y el botón se desbloquea siempre, en un `finally`. Si falla el registro con el archivo ya confirmado, **reintentar con el mismo archivo lo registra sin subirlo otra vez**; con otro archivo, sube el nuevo. El progreso usa `XMLHttpRequest` (`subirArchivo.ts`), porque `fetch` no informa el avance de una subida.

## Pendientes

- **Herencia entre períodos (para HIS).** Hoy el material es del curso de un período. Para que el curso del semestre siguiente herede los materiales hace falta un identificador de curso estable entre períodos (por ejemplo, el código dentro de la carrera) o copiar los materiales al abrir el período; lo define HIS (historial). Hasta entonces, el próximo profesor **del mismo período** los hereda, pero uno de otro período no.
- **MAT-02 (sílabo) debería seguir el mismo patrón sobre archivo.** Hoy MAT-02 tiene su propia carga (`CrearSilabo`). Conviene que su tabla referencie un archivo confirmado de MAT-01 (`archivo_id` único con FK compuesta, trigger de validación y subida en cuatro pasos), en vez de guardar el contenido por separado.
- **Quién gestiona un material ajeno.** La política de `UPDATE` exige `subido_por = usuario_actual()` (como `archivo`): hoy solo quien lo registró lo modifica o archiva, y si dejó la sección, nadie. Ver y registrar sí es de todos los profesores del curso. Cuando exista la edición o el archivado de materiales, la política debe dejar que cualquier profesor vigente del curso lo gestione y mantener `subido_por` inmutable (ya lo asegura el trigger).
- **Descarga y listado para el resto.** MAT-01 hace que un alumno descargue los archivos del equipo docente **de su sección**; un material subido por el profesor de otra sección no estaría cubierto. MAT-05 y MAT-06 deben resolverlo (por ejemplo, descargar por material y no por archivo).
- **Archivos sin material.** Si falla el registro y el profesor abandona, queda un archivo confirmado sin material. Se suma a las filas y objetos huérfanos de MAT-01 (ver su guía).
- **Matriz de permisos de `Archivo`.** `permisos.spec.ts` no incluye el sujeto `Archivo` de MAT-01; esta tarjeta solo agrega `Material`.

## Verificación

Desde la raíz, con Node 24.15+, dependencias instaladas y PostgreSQL disponible:

```bash
npm run lint
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
npm run build
npx prettier --check .
```

- `backend/test/materiales/materiales.db-spec.ts` (PostgreSQL, con la API y un almacenamiento en memoria):
  - **API**: 201 con el material del curso, la descripción opcional y las cuatro categorías; el segundo profesor de la sección (GES-25) y el de otra sección del curso registran, y todos los profesores del curso lo ven; 400 por archivo sin confirmar, de otra sección o curso, ajeno, archivado, inexistente o de otra universidad, y por datos inválidos; 403 para ayudante, alumno, Administrativo, Director y profesores de otra sección o curso; 404 de otra universidad; 409 al duplicar, también en paralelo.
  - **Base** (SQL directo, con el rol de la API): quién inserta, a nombre de quién y con qué archivo; quién lee (integrantes del curso sí; profesor de otro curso, alumno ajeno, otra universidad, Administrativo y sin usuario fijado, 0 filas; el Director sí); quién modifica; sin `DELETE`; CHECK de categoría, título y descripción; y la auditoría del superadmin.
- `backend/test/materiales/materiales.e2e-spec.ts`: sesión, permisos CASL y formato del id, sin base de datos.
- `backend/test/database/esquema-inicial.db-spec.ts` y `backend/test/multitenant/rls.db-spec.ts`: revierte la migración, y `material` entra en los contratos de RLS (políticas que dependen de `usuario_actual()`, `INSERT/SELECT/UPDATE` sin `DELETE`, trigger de auditoría).
- `frontend/src/pages/PestanaMaterial.test.tsx`: solo el profesor ve el formulario; el flujo completo con su progreso; el error en cada paso (pedir, subir, confirmar y registrar), con el botón desbloqueado y el reintento sin subir otra vez; y las validaciones.

## Revisión en local

1. `docker compose up -d --wait` levanta PostgreSQL y LocalStack con el bucket (ver "Archivos local (S3)" en el README principal), y `npm run migration:run --workspace=backend` aplica la migración.
2. Carga el seed y levanta el backend y el frontend (`npm run dev:back`, `npm run dev:front`).
3. Entra como `profesor@norte.cursus.test`, abre una sección de ICC101 y la pestaña **Material**.
4. Sube un archivo permitido con categoría y título: ves el progreso, "Material subido" y el material en la lista.
5. Sin archivo, con un tipo no permitido o con más de 20 MB, el formulario avisa sin subir nada.
6. Entra como el alumno o el ayudante de esa sección: la pestaña **Material** está deshabilitada.

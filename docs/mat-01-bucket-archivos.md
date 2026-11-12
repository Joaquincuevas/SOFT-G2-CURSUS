# MAT-01: bucket S3 privado para los archivos de los cursos

Tarjeta: [F4 · MAT-01 Bucket S3 privado y política de acceso para archivos del curso](https://trello.com/c/NOva8MSh/130-f4-mat-01-bucket-s3-privado-y-pol%C3%ADtica-de-acceso-para-archivos-del-curso). Referencia: diseño técnico (Entrega 3). Sin dependencias dentro de la fase. La usan MAT-02 (sílabo), MAT-04 (materiales) y MAT-09 (entregas).

## Comportamiento

Los archivos de una sección se guardan en un bucket S3 **privado**. No pasan por la API: API Gateway acepta hasta 10 MB por petición y los archivos llegan a 20 MB. El navegador sube y descarga directo con URLs firmadas de corta duración, que el backend genera solo para integrantes de la sección.

Subir tiene dos pasos:

1. **Pedir la subida.** El backend registra el archivo, sin confirmar, y firma un POST directo a S3 para esa llave, ese tamaño exacto y ese tipo, válido por 10 minutos. S3 rechaza cualquier otro archivo: con más o menos bytes (400), de otro tipo (403) o con la firma vencida.
2. **Confirmar.** Cuando el navegador terminó, el backend revisa que el objeto esté en S3 con el tamaño y el tipo registrados y marca el archivo como subido. Solo entonces se puede descargar.

Para descargar, el backend firma un GET de 5 minutos que entrega el archivo con su nombre original.

| Quién en la sección    | Pedir y confirmar una subida | Descargar                                         |
| ---------------------- | ---------------------------- | ------------------------------------------------- |
| Profesor a cargo       | Sí                           | Cualquier archivo                                 |
| Ayudante               | Sí                           | Cualquier archivo                                 |
| Alumno inscrito        | Sí                           | Los suyos y los del equipo docente (404 el resto) |
| Director               | No (403)                     | Cualquier archivo, en solo lectura                |
| Administrativo         | No (403)                     | No (403)                                          |
| Quien no es integrante | No (403)                     | No (403), aunque tenga el id                      |

Un alumno no descarga la entrega de otro alumno: recibe 404, sin saber que existe. MAT-02, MAT-04 y MAT-09 agregan sus propias reglas (por ejemplo, quién sube el sílabo) sobre esta base.

**Tipos permitidos**, hasta 20 MB: PDF, PNG, JPEG, Word, Excel, PowerPoint (`.docx`, `.xlsx`, `.pptx`), ZIP, texto (`.txt`) y Jupyter (`.ipynb`). El tipo se deduce de la extensión, sin importar mayúsculas, y no del navegador, que no informa uno confiable para todos (por ejemplo, `.ipynb`). La lista está en `TIPOS_ARCHIVO` de `@cursus/shared`.

Nada se elimina: no hay DELETE en la API ni en el rol de la tarea, y un archivo se archiva con `archived_at`.

## API y datos

Rutas del espacio de la sección (ESP-06: `@IntegranteDeSeccion()`):

- `POST /api/espacio/secciones/:id/archivos` con `{ nombre, tamano }` (bytes): responde 201 con `SubidaArchivo`, es decir `{ archivo, subida: { url, campos, expiraEn } }`. El navegador envía un POST multipart a `url` con los `campos` y, al final, el archivo en el campo `file`. Responde 400 con un tipo no permitido, un nombre vacío o con `/`, `\` o caracteres de control, un tamaño fuera de 1 B a 20 MB o no entero, o un campo extra. Responde 503 si el almacenamiento no está configurado (sin `S3_BUCKET`), sin registrar nada.
- `POST .../archivos/:archivoId/confirmar`: responde 200 con `ArchivoResumen` (`subidoEn` con la fecha). Solo quien lo subió (al resto, 404). Responde 409 si el objeto todavía no está en S3 o no tiene el tamaño o el tipo registrados. Confirmar de nuevo no cambia nada.
- `GET .../archivos/:archivoId/descarga`: responde 200 con `DescargaArchivo` (`{ url, expiraEn }`). Responde 404 si el archivo no es de la sección, no está confirmado o está archivado.

Permisos (CASL, `Archivo`): el profesor, el ayudante y el alumno tienen `create` y `read`, y el Director, `read`. El controlador exige además el rol en la sección.

La migración `1792770000000-CrearArchivo` crea `archivo`:

| Columna       | Detalle                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------- |
| `seccion_id`  | Sección del archivo (FK compuesta por universidad)                                           |
| `subido_por`  | Quién lo subió (FK compuesta por universidad)                                                |
| `subido_como` | Su rol en la sección al subirlo: `PROFESOR`, `AYUDANTE` o `ALUMNO`                           |
| `nombre`      | Nombre original, de 1 a 255 caracteres sin espacios al borde. Solo para mostrar y descargar. |
| `tipo`        | Tipo deducido de la extensión                                                                |
| `tamano`      | Bytes, de 1 a 20 MB                                                                          |
| `clave`       | Llave del objeto en S3: `universidad/sección/archivo`. Un CHECK exige ese formato.           |
| `subido_at`   | Cuándo se confirmó la subida; `NULL` mientras no se confirma                                 |

- La llave no usa el nombre que escribe el usuario, así que no puede apuntar a otra carpeta del bucket.
- RLS con el patrón de `anuncio`: cada universidad lee sus archivos y el Director los de todas. Solo el profesor, el ayudante y el alumno registran o confirman, en su universidad, y **solo archivos propios**: el `INSERT` y el `UPDATE` exigen `subido_por = usuario_actual()`, el usuario que fija la API con `fijarUsuario`. Así nadie registra un archivo a nombre de otro ni modifica uno ajeno (`subido_at`, `archived_at`, `nombre`), ni con SQL directo. Sin DELETE.
- Al pedir la subida y al confirmarla se vuelve a revisar que el usuario siga siendo integrante con ese rol, por si cambió después del guard (al confirmar, si ya no lo es, 403).
- La regla del alumno al descargar va en el `WHERE` de la consulta, no en código: si el archivo es la entrega de otro alumno, no hay fila y responde 404.

## Infraestructura

En [infra/aws/cursus.yml](../infra/aws/cursus.yml):

- **`BucketArchivos`** (`cursus-<entorno>-archivos-<cuenta>`): bloqueo total de acceso público, sin ACLs (`BucketOwnerEnforced`), cifrado SSE-S3, versionado (si un objeto se sobrescribe, se conserva el anterior) y limpieza de subidas multiparte incompletas al día. `DeletionPolicy: Retain`: el bucket se conserva aunque se borre el stack.
- **CORS:** permite GET, HEAD y POST desde el frontend. Por defecto, production acepta `https://cursus-g2.vercel.app`, y staging acepta `https://cursus-staging.vercel.app` y los previews del proyecto en Vercel. Se cambia con el parámetro `OrigenesFrontend`. CORS no protege el bucket (eso lo hace la firma): solo deja que el navegador lea la respuesta de S3.
- **`PoliticaBucketArchivos`:** rechaza cualquier acceso sin HTTPS.
- **`RolTarea`** (`cursus-<entorno>-ecs-tarea`): el rol con el que corre el backend, distinto del de ejecución. Solo tiene `s3:GetObject` y `s3:PutObject` sobre los objetos del bucket: no lista, no borra y no toca otros recursos. El backend no usa llaves.
- La definición de tarea recibe `S3_BUCKET` y `S3_REGION`. `deploy.sh` copia la definición vigente, así que cada deploy conserva el rol y las variables.

**Para aplicarlo** (lo hace el dueño de la cuenta de AWS desde CloudShell, en cada entorno):

```bash
bash infra/aws/stack.sh staging --dry-run   # debe agregar el bucket, su política y RolTarea, y una revisión nueva de DefinicionTarea
bash infra/aws/stack.sh staging
```

**El stack va antes del primer deploy de la imagen de la fase 4.** `stack.sh` corre `aws cloudformation deploy`, que crea el bucket, agrega `S3_BUCKET` y `RolTarea` a la definición de tarea y da a `PoliticaDespliegue` el `iam:PassRole` sobre `RolTarea`. Sin eso, el workflow de deploy falla con `AccessDenied` en `register-task-definition` (pasa un rol que el usuario de GitHub no puede pasar) y, aunque pasara, la API arrancaría sin `S3_BUCKET` y las rutas de archivos responderían 503. El orden es:

1. `bash infra/aws/stack.sh staging` y, si el entorno está apagado, `start.sh staging`; si está encendido, reintentar el workflow de deploy.
2. Validar en staging: migraciones aplicadas, `/api/health/db` en 200 y una subida y descarga de archivo.
3. `bash infra/aws/stack.sh production` y recién entonces el merge a `main`, que dispara el deploy de producción.

En local, el bucket lo da LocalStack (ver "Archivos local (S3)" en el README principal).

## Pendientes

- **Filas sin confirmar y objetos huérfanos.** Si el navegador pide una subida y no la termina, queda una fila de `archivo` sin `subido_at`. Si sube el objeto y no confirma, queda además el objeto en S3. Nada los limpia todavía: no molestan (no se descargan ni se listan), pero ocupan espacio. Queda pendiente una limpieza periódica, por ejemplo archivar las filas sin confirmar de más de un día y quitar sus objetos con una regla de ciclo de vida del bucket.
- **La RLS de lectura deja ver la metadata de todos los archivos de la universidad** (nombre, tipo, tamaño), no solo los de las secciones del usuario. La API nunca la expone así (las rutas filtran por sección y rol), pero la RLS es más amplia que la regla. Conviene acotarla cuando existan los listados de MAT-05 (materiales) y MAT-10 (entregas), que definen quién ve qué.

## Verificación

Desde la raíz, con Node 24.15+, dependencias instaladas y PostgreSQL disponible:

```bash
npm run lint
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
npm run build
```

- `backend/src/archivos/almacenamiento.service.spec.ts`: la política firmada exige la llave, el tamaño exacto y el tipo, y vence a los 10 minutos; la descarga vence a los 5 minutos y entrega el nombre original; 503 sin bucket; tipos por extensión. Firmar no usa la red.
- `backend/test/archivos/archivos.db-spec.ts`: pedir, confirmar y descargar por rol; un alumno no descarga la entrega de otro; validación del body; 503 sin almacenamiento; confirmar después de dejar la sección (403); RLS y restricciones de la tabla, con SQL directo: nadie registra un archivo sin usuario fijado o a nombre de otro, ni modifica uno ajeno, ni lo pasa a nombre de otro. Usa un almacenamiento en memoria en vez de S3, así que el CI no necesita LocalStack.
- `backend/test/archivos/archivos.e2e-spec.ts`: permisos por rol, sesión y que no hay DELETE.
- `infra/aws/cursus.yml` pasa `cfn-lint`.

## Revisión en local

1. `docker compose up -d --wait` levanta PostgreSQL y LocalStack con el bucket. Copia las variables `S3_*` de `.env.example` a tu `.env` si no las tienes.
2. Ejecuta las migraciones (`npm run migration:run --workspace=backend`) y levanta el backend (`npm run dev:back`).
3. Con el token de un profesor a cargo de una sección, pide una subida:

   ```bash
   curl -s -X POST localhost:3000/api/espacio/secciones/<seccion>/archivos \
     -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' \
     -d '{"nombre": "guia.pdf", "tamano": 5}'
   ```

4. Sube el archivo con los campos de la respuesta, en el mismo orden y con el archivo al final:

   ```bash
   printf 'hola!' > /tmp/guia.pdf
   curl -s -o /dev/null -w '%{http_code}\n' <url> -F key=<campos.key> -F Content-Type=application/pdf \
     -F <resto de los campos> -F file=@/tmp/guia.pdf      # 204
   ```

   Con otro tamaño responde 400, y con otro `Content-Type`, 403.

5. Confirma (`POST .../archivos/<id>/confirmar`, responde 200) y pide la descarga (`GET .../archivos/<id>/descarga`): la `url` entrega el archivo con su nombre.

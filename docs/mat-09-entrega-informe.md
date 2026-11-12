# MAT-09: el alumno entrega su informe en una actividad

Tarjeta: [F4 · MAT-09](https://trello.com/c/qp6oXaGH/137-f4-mat-09-alumno-entrega-su-informe-en-una-actividad). Referencia: RN-08. Depende de MAT-01 (archivos privados en S3) y MAT-08 (actividades con plazo), integradas en `develop`.

**Como** alumno, **quiero** entregar mi informe en una actividad, **para** cumplir con la evaluación del curso.

## Criterios de aceptación

| Criterio                                                                                         | Implementación y pruebas                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El alumno sube un archivo mientras la actividad está abierta; puede reemplazarlo hasta el plazo. | El formulario de cada actividad permite entregar y reemplazar. MAT-01 sube y confirma el archivo; el PUT acredita la entrega. Cada reemplazo agrega una fila y conserva las anteriores. Pruebas de interfaz y PostgreSQL. |
| Pasado el plazo, no se aceptan entregas nuevas.                                                  | La API comprueba el plazo y el trigger vuelve a comprobar `clock_timestamp()` al insertar, después de cualquier espera y de verificar S3. Cubre vencimiento durante la petición, entrega inicial y reemplazo.             |
| El alumno ve la confirmación con fecha y hora.                                                   | El comprobante muestra el nombre del informe y la fecha/hora asignada por PostgreSQL, en Chile continental, incluso después del cierre o al recargar.                                                                     |

## Uso

En **Mis cursos → sección → Entregas**, el alumno ve en cada actividad:

- su comprobante actual, con el nombre del archivo y la fecha/hora de entrega, o **Aún no has entregado tu informe**;
- mientras está abierta, un selector de archivo y **Entregar informe** o **Reemplazar entrega**;
- al terminar, **Entrega confirmada** y el nuevo comprobante;
- al cerrar, el comprobante sigue visible y se retira el formulario.

Se reutilizan los tipos y el límite de MAT-01: un archivo no vacío de hasta 20 MB. La subida va directamente a S3; el JWT solo se envía a la API. El selector y el botón quedan bloqueados durante la operación. Un fallo conserva el archivo elegido y el comprobante anterior. Reintentar continúa desde el último paso completado, sin volver a subir lo ya confirmado. Una firma rechazada se renueva.

El cierre que decide la API prevalece sobre el estado de la pantalla: empezar a subir antes del plazo no garantiza que la entrega llegue a tiempo. El archivo debe quedar registrado como entrega antes del plazo. Las descargas del equipo docente son de [MAT-10](mat-10-descargar-entregas.md).

## API

`GET /api/espacio/secciones/:id/actividades/:actividadId/mi-entrega`

`PUT /api/espacio/secciones/:id/actividades/:actividadId/mi-entrega`, con `{ "archivoId": "uuid" }`.

El archivo debe estar confirmado por MAT-01, activo, subido como alumno por la persona de la sesión y pertenecer a la misma sección. `alumnoId`, la hora y la versión del objeto nunca se aceptan desde el cuerpo.

Ambos responden 200, `MiEntregaActividad`:

```json
{
  "cerrada": false,
  "entrega": {
    "id": "uuid",
    "archivo": {
      "id": "uuid",
      "nombre": "Informe.pdf",
      "tipo": "application/pdf",
      "tamano": 1234,
      "subidoEn": "2026-11-11T15:00:00.000Z"
    },
    "entregadaEn": "2026-11-11T15:01:42.000Z"
  }
}
```

Sin entrega, `entrega` es `null`. La fecha de subida del archivo y la de entrega son distintas: solo `entregadaEn` acredita la entrega.

| Resultado | Motivo                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------- |
| 400       | UUID/cuerpo inválido, campos adicionales o archivo ajeno, sin confirmar, archivado o de otra sección. |
| 401       | Sin sesión.                                                                                           |
| 403       | Otro rol, alumno no inscrito o inscripción retirada.                                                  |
| 404       | Sección/curso/actividad archivados, inexistentes, de otra universidad o actividad de otra sección.    |
| 409       | Plazo vencido, o el objeto no coincide con el archivo confirmado.                                     |
| 503       | Almacenamiento no disponible o sin versionado para fijar el archivo aceptado.                         |

Repetir el PUT con un archivo ya aceptado es idempotente: devuelve el comprobante vigente sin crear otra fila ni cambiar su fecha, incluso después del plazo. Reintentar una versión anterior tampoco reemplaza la entrega más reciente. Las peticiones concurrentes de un mismo alumno/actividad se serializan con un advisory lock.

## Datos y permisos

Migración `1792840000000-CrearEntrega`, libre respecto de las ramas abiertas y posterior a las migraciones integradas. Agrega:

- `entrega`, con universidad, actividad, alumno, archivo, `version_objeto` y fecha del servidor;
- FKs compuestas por universidad a `actividad`, `usuario` y `archivo`, e índices para la consulta de la última entrega;
- unicidad por actividad/alumno/archivo para que un reintento no duplique la entrega;
- RLS de SELECT/INSERT solo para el alumno de la sesión, con `fijarUsuario`; sin UPDATE ni DELETE;
- un trigger que valida archivo confirmado y propio, sección e inscripción vigentes y plazo abierto, y fija la hora con `clock_timestamp()` aunque SQL intente imponer otra;
- el trigger convencional de auditoría del superadmin, aunque esta tarjeta no le concede permisos de entrega.

Los locks de sección, curso, inscripción, usuario y archivo conservan su vigencia durante la operación. La actividad se relee al insertar; bloquearla con `FOR SHARE` aplicaría su política de modificación, reservada al profesor, e impediría la entrega del alumno. La comprobación final del plazo no usa `now()`, que representa el inicio de la transacción.

Las versiones anteriores se conservan como filas de solo adición; consultar la entrega devuelve la más reciente por fecha del servidor e id. `down()` retira la tabla, la función y las claves únicas auxiliares; no toca los objetos de S3. Como en otras migraciones de creación, revertirla elimina los registros de esta funcionalidad.

### Versión exacta del archivo

MAT-01 ya habilita versionado en el bucket AWS. MAT-09 obtiene el `VersionId` mediante [HeadObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html), comprueba tamaño y tipo y guarda esa versión en `entrega.version_objeto`. Una URL de subida todavía vigente puede crear otra versión del objeto, pero no cambia la versión acreditada por la entrega.

MAT-10 deberá firmar la descarga con ese `VersionId`, usando el permiso `s3:GetObjectVersion`, y definir la lectura del equipo docente sobre `entrega`. La descarga genérica de MAT-01 no sustituye esa consulta: descarga el objeto actual, no la versión acreditada.

En LocalStack, el script de inicio habilita también el versionado y CORS para `http://localhost:5173` y `http://127.0.0.1:5173`. Para un contenedor que ya existía, aplicar esos ajustes con `docker compose exec s3 bash /etc/localstack/init/ready.d/crear-bucket.sh` o reiniciar el servicio local. No se cambia ni se despliega infraestructura AWS en esta tarjeta.

## Verificación

Con Node 24.15+, dependencias instaladas y PostgreSQL disponible:

```sh
npm run lint
npm run format:check
npm run build
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
```

- `entregas.db-spec.ts`: subida/confirmación real de la API con un sustituto de S3, fecha/versión, reemplazos conservados, idempotencia, concurrencia, cierre durante la verificación, rollback ante fallos, permisos, aislamiento entre alumnos/universidades, archivos inválidos y restricciones RLS/SQL.
- `entregas.e2e-spec.ts`: 401/403, ids y cuerpo inválidos, campos de identidad/hora rechazados y rutas inexistentes.
- `MiEntrega.test.tsx`: formulario, orden de los pasos, POST multipart sin JWT, comprobante en hora de Chile, reemplazo, errores y reintentos por etapa, firma rechazada, validación de archivo y bloqueo durante el envío.
- La matriz CASL, el contrato RLS y la aplicación/reversión de migraciones incorporan `Entrega`.

## Revisión manual

1. Levantar PostgreSQL y S3 local (`docker compose up -d`), aplicar migraciones y cargar el seed.
2. Como profesor de una sección, crear una actividad con un plazo futuro.
3. Como alumno inscrito, abrir **Entregas**, elegir un archivo y entregarlo. Verificar nombre, fecha y hora, y recargar la página.
4. Reemplazar el archivo antes del plazo: el comprobante cambia y la fila anterior permanece en PostgreSQL.
5. Dejar vencer el plazo y comprobar que no puede entregar ni reemplazar. Una petición preparada antes pero terminada después también debe fallar sin cambiar el comprobante.
6. Ingresar como otro alumno y comprobar que no ve la entrega anterior.

Se verificó el circuito completo contra la API compilada, PostgreSQL y LocalStack reales, en una base aislada: subida multipart firmada, confirmación, entrega, reemplazo conservando ambas filas, reintento sin duplicar y rechazo posterior al plazo. Tras sobrescribir el objeto con una firma aún vigente, la lectura con el `VersionId` acreditado siguió devolviendo el informe aceptado y el comprobante no cambió.

La verificación visual y las capturas quedaron pendientes: el host de control del navegador no estuvo disponible. La interfaz se verificó con las pruebas de componentes; no se presenta una captura simulada como evidencia de uso real.

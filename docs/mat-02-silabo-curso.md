# MAT-02 · Profesor publica el sílabo del curso

En **Mis Cursos → sección → Material**, cualquier profesor vigente de la sección puede publicar un PDF de hasta 10 MiB. Cada publicación conserva las versiones anteriores y el historial muestra el profesor responsable y la fecha.

La interfaz pide la subida firmada a MAT-01, envía el PDF al bucket privado y confirma el archivo. Después publica la referencia con `POST /api/espacio/secciones/:id/silabo` y el cuerpo `{ archivoId }`. La API comprueba que el archivo sea propio, esté confirmado, corresponda a esa sección y tenga tamaño y tipo PDF válidos. Lee la cabecera del objeto de S3 y guarda su identificador de versión para que la descarga futura entregue los mismos bytes. El bloqueo del curso serializa la numeración y repetir el registro del mismo archivo devuelve la versión existente.

La migración `1792870000000-CrearSilabo` guarda `archivo_id`, `curso_id`, `version`, `subido_por`, `subido_en` y `version_objeto`, además de los identificadores de fila y universidad. La RLS verifica la identidad de sesión, la asignación vigente y el archivo de origen. La tabla usa el trigger de auditoría del superadmin y solo admite adiciones desde el rol de la aplicación.

`GET /api/espacio/secciones/:id/silabo` lista las versiones del curso. `GET /api/espacio/secciones/:id/silabo/:version` entrega una URL firmada a los integrantes de la sección. La descarga genérica de MAT-01 excluye los archivos vinculados a un sílabo. El bucket necesita versionado activo y el rol que firma las descargas necesita `s3:GetObjectVersion`.

## Cómo revisar

1. Como profesor, publicar dos PDF desde Material y comprobar las versiones 2 y 1 con su fecha y responsable. Repetir con un co-profesor de GES-25.
2. Descargar ambas versiones. Comprobar que cada URL contiene el identificador de la versión del objeto publicada.
3. Como integrante de otra sección del mismo curso, consultar el historial por API. Probar también con un Director y con un profesor ajeno a la sección.
4. Intentar publicar un archivo sin confirmar, ajeno o con cabecera inválida. Revisar que la API rechace la publicación y conserve el historial.

```sh
npm run test --workspace=frontend -- src/pages/PestanaMaterial.test.tsx src/pages/VistaSeccion.test.tsx
npm run test:db --workspace=backend -- test/archivos/archivos.db-spec.ts test/database/esquema-inicial.db-spec.ts test/multitenant/rls.db-spec.ts
```

Las pruebas de integración usan PostgreSQL real y simulan el bucket para comprobar qué versión se valida y se firma.

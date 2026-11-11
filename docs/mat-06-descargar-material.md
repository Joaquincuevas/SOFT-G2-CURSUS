# MAT-06: el alumno descarga un material del curso

Tarjeta: F4 · MAT-06 (https://trello.com/c/5taoVZet). Referencia: RN-08. Depende de MAT-05; usa [MAT-01](mat-01-bucket-archivos.md) (archivos en S3) y [MAT-04](mat-04-subir-material.md) (materiales del curso).

**Como** alumno, **quiero** descargar un material del curso, **para** estudiar sin conexión.

## Criterios

| Criterio                                                                            | Cómo se cumple                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cada material tiene un botón de descarga que entrega el archivo original.           | Botón **Descargar** en cada material de la pestaña Material. S3 entrega el objeto subido, con su nombre original (`Content-Disposition` de MAT-01).                          |
| La descarga usa una URL firmada que expira a los pocos minutos.                     | La API firma un GET de S3 válido por 5 minutos (`firmarDescarga` de MAT-01). La pantalla lo abre de inmediato y no lo guarda.                                                |
| Un usuario que no pertenece a la sección no puede descargar aunque tenga el enlace. | La ruta exige ser integrante (ESP-06) y la RLS de `material` solo muestra los cursos donde lo es: 403 aunque tenga el id del material. La URL firmada vence a los 5 minutos. |

**Lista mínima de MAT-05.** El botón necesita una lista que el alumno vea, y MAT-05 aún no existe: esta tarjeta abre la pestaña Material al ayudante y al alumno con la lista de MAT-04 (título, categoría, descripción y archivo). Filtros y orden por categoría quedan para MAT-05.

## Comportamiento

**Se descarga por material, no por archivo.** La descarga de MAT-01 (`.../archivos/:archivoId/descarga`) exige que el archivo sea de esa sección, pero el material es de todo el curso (MAT-04). Así, el alumno de la sección 2 descarga lo que subió el profesor de la sección 1.

| Quién en la sección                     | Lista y descarga                    |
| --------------------------------------- | ----------------------------------- |
| Profesor (cualquiera de los vigentes)   | Sí                                  |
| Ayudante                                | Sí                                  |
| Alumno inscrito                         | Sí                                  |
| Director                                | Sí, en solo lectura (solo por API)  |
| Administrativo de la facultad del curso | 403                                 |
| Quien no es integrante de la sección    | 403 (404 si es de otra universidad) |

- **El Director** descarga como en MAT-01, por la API: la vista de la sección es de Mis Cursos, que solo tienen el profesor, el ayudante y el alumno.
- **Quien deja la sección** (por ejemplo, un alumno al que le archivan la inscripción) deja de descargar en el siguiente pedido.
- **Sobre "aunque tenga el enlace".** La API revisa la pertenencia en cada pedido, así que el id del material o la ruta de la API no sirven a quien no es integrante. La URL firmada de S3, en cambio, sirve a quien la tenga mientras no venza: por eso dura solo 5 minutos y la pantalla no la guarda ni la muestra.

## API

`GET /api/espacio/secciones/:id/materiales/:materialId/descarga`, con `@IntegranteDeSeccion()` y `@Puede('read', 'Material')`: responde 200 con `DescargaArchivo` (`{ url, expiraEn }`, de `@cursus/shared`).

- 400 si el id del material no es un UUID.
- 403 sin permiso (Administrativo) o si no es integrante de la sección.
- 404 si el material no existe, es de otro curso, está archivado o su archivo está archivado. También con el id de un archivo en vez del de un material.
- 503 sin almacenamiento configurado (sin `S3_BUCKET`), como MAT-01.

`GET /api/espacio/secciones/:id/materiales` (MAT-04) ahora responde también al ayudante, al alumno y al Director. Ya no lista los materiales cuyo archivo se archivó, porque no se pueden descargar.

Permisos (CASL, `Material`): el profesor tiene `create` y `read`; el ayudante, el alumno y el Director, `read`. El Administrativo no recibe nada.

## Datos

No hay migración. La RLS de `material` de MAT-04 ya deja leer a los integrantes de cualquier sección del curso (con `usuario_actual()`) y al Director en todas las universidades; la de `archivo`, los de la universidad. `MaterialesService.leerDelCurso` lee como el Director en una transacción READ ONLY (`consultarEnTodasLasUniversidades`) y al resto con su usuario fijado.

## Pantalla

En la pestaña **Material**, cada material muestra su archivo, con su tamaño, y un botón **Descargar** (nombre accesible "Descargar _título_"). Al hacer clic:

1. el botón se bloquea y dice "Descargando…";
2. la pantalla pide la URL firmada y abre un enlace con ella; el navegador descarga el archivo con su nombre;
3. si falla, muestra "No pudimos descargar «_título_». Inténtalo nuevamente." (`role="alert"`). El botón se desbloquea siempre, en un `finally`.

El formulario **Subir material** solo aparece para el profesor.

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

- `backend/test/materiales/materiales.db-spec.ts` (PostgreSQL, con un almacenamiento en memoria):
  - descargan los dos profesores de la sección, el ayudante, el alumno, el profesor y el alumno de **otra sección del curso** (por su sección) y el Director, con la URL del archivo y su nombre original, que vence en 5 minutos;
  - 403 para el Administrativo, un alumno que no es de la sección, un profesor de otro curso, el alumno de otra sección pidiendo por la sección 1, y el alumno que deja la sección;
  - 404 para un material de otro curso pedido desde una sección propia, otra universidad, un material o un archivo archivado, un id inexistente o el de un archivo; 400 por el formato del id; 503 sin almacenamiento;
  - el listado responde al ayudante, a los alumnos de las dos secciones y al Director, y no incluye materiales con el archivo archivado.
- `backend/test/materiales/materiales.e2e-spec.ts`: 401 sin sesión y 403 por CASL para el Administrativo, también en la descarga.
- `backend/src/auth/permisos.spec.ts`: la matriz de `Material`.
- `frontend/src/pages/PestanaMaterial.test.tsx`: el ayudante y el alumno ven la lista y el botón, sin el formulario; el botón se bloquea mientras pide y abre la URL; con 403, 404 o 503 avisa y se desbloquea; el aviso desaparece al reintentar.
- `frontend/src/pages/VistaSeccion.test.tsx`: la pestaña Material está habilitada para el alumno.

## Revisión en local

1. `docker compose up -d --wait` levanta PostgreSQL y LocalStack con el bucket. Revisa que tu `.env` tenga las variables `S3_*` de `.env.example` (ver "Archivos local (S3)" en el README principal).
2. Ejecuta las migraciones, carga el seed y levanta el backend y el frontend (`npm run dev:back`, `npm run dev:front`).
3. Entra como `profesor@norte.cursus.test`, abre una sección de ICC101, pestaña **Material**, y sube un material.
4. Entra como `alumno@norte.cursus.test` en esa sección: en **Material** ves la lista sin el formulario. **Descargar** baja el archivo con su nombre original.
5. Con la sesión de una cuenta que no es de la sección, pide `GET /api/espacio/secciones/<sección>/materiales/<material>/descarga` con su token: 403.

LocalStack no exige la firma (ver el README principal): en local una URL vencida, o sin firma, también descarga. El vencimiento se comprueba en staging, con el bucket real.

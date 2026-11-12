# ANU-01: el profesor publica un anuncio para todo el curso

Tarjeta: [F4 · ANU-01 Profesor publica un anuncio para todo el curso](https://trello.com/c/ZeitK1tr). Referencia: RN-09. Sin dependencias dentro de la fase.

## Comportamiento

Un profesor publica un anuncio desde el espacio de una de sus secciones. El anuncio es **del curso**, no de la sección: lo ven los integrantes de todas las secciones del curso, aunque tengan otro profesor. Tiene título y cuerpo, ambos obligatorios, y muestra su autor y su fecha de publicación.

Puede publicar **cualquier profesor del curso**: basta con estar a cargo de una de sus secciones. Un curso con varios profesores no tiene uno que coordine, así que ninguno queda fuera.

Leen los anuncios, en el espacio de su sección:

| Quién                                      | Lee | Publica |
| ------------------------------------------ | --- | ------- |
| El profesor a cargo de la sección          | Sí  | Sí      |
| Ayudantes y alumnos de la sección          | Sí  | No      |
| El Administrativo de la facultad del curso | 403 | 403     |
| El Director                                | Sí  | No      |
| Cualquier otro usuario de la universidad   | 403 | 403     |

Quién entra al espacio de una sección lo decide el guard de ESP-06; ver [ESP-06](esp-06-acceso-seccion.md). El Administrativo pasa ese guard, pero, igual que en NOT-01 y ASI-01, no recibe permisos sobre los anuncios: la tarjeta no los pide para él.

## Pantalla

La pestaña **Anuncios** de la vista de la sección (ESP-04) queda habilitada (`PestanaAnuncios`). Muestra los anuncios del curso, del más nuevo al más antiguo, cada uno con título, autor, fecha y hora de publicación (en la hora local) y el mensaje con sus saltos de línea. Sin anuncios, dice "Aún no hay anuncios".

El profesor de la sección ve además el formulario **Nuevo anuncio**, con Título y Mensaje obligatorios y el aviso de que lo verán todas las secciones del curso. Al publicar, se limpia el formulario, aparece "Anuncio publicado para todas las secciones del curso" y la lista se actualiza. Un 400 muestra el mensaje de la API (por ejemplo, "Ingresa el cuerpo del anuncio") y conserva lo escrito.

La pestaña usa el mecanismo de NOT-01 (`CONTENIDO` en `VistaSeccion.tsx`, con `PropsPestana`), copiado tal cual para que al integrar NOT-01 y ASI-01 solo se sumen las entradas de cada pestaña.

## API

| Método | Ruta                                  | Cuerpo               | Resultado                                                |
| ------ | ------------------------------------- | -------------------- | -------------------------------------------------------- |
| GET    | `/api/espacio/secciones/:id/anuncios` | Ninguno              | 200, `Anuncio[]` del curso, del más nuevo al más antiguo |
| POST   | `/api/espacio/secciones/:id/anuncios` | `{ titulo, cuerpo }` | 201, el `Anuncio` publicado                              |

`Anuncio` (`@cursus/shared`) es `{ id, titulo, cuerpo, autor: { id, nombre }, publicadoEn }`, con `publicadoEn` en ISO 8601.

- 400: título o cuerpo ausente, que no es texto o de solo espacios; título de más de 200 caracteres o cuerpo de más de 5000; caracteres de control (PostgreSQL rechaza el NUL y respondería 500); campos extra; o un id que no es UUID.
- El título se guarda en una línea, sin espacios repetidos. El cuerpo conserva sus saltos de línea y tabulaciones. Los dos se guardan sin espacios al inicio ni al final.
- 401 sin sesión.
- 403 al publicar: alumno, ayudante, Administrativo, Director, o un profesor que no está (o dejó de estar) a cargo de esa sección. 403 al leer: el Administrativo, o quien no es integrante de la sección.
- 404: la sección no existe, está archivada o es de otra universidad.

Los permisos van en `shared/src/permisos.ts`, con el mismo formato que NOT-01 y ASI-01: el sujeto nuevo `Anuncio` da `create` al profesor y `read` al profesor, el ayudante, el alumno y el Director. Las dos rutas llevan además `@IntegranteDeSeccion()`, como toda ruta del espacio, y el controlador revisa el rol que el usuario tiene en la sección. El `INSERT` vuelve a exigir que siga a cargo de ella y que la sección y su curso sigan vigentes; si no, 403 o 404.

## Base de datos

La migración `CrearAnuncio` (`1792560000000`, después de NOT-01 y ASI-01) crea la tabla `anuncio`:

- `curso_id`, `autor_id`, `titulo`, `cuerpo`, `archived_at`, y `created_at`, que es la fecha de publicación.
- FKs compuestas `fk_anuncio_curso` y `fk_anuncio_autor`: el curso y el autor son de la misma universidad que el anuncio.
- `ck_anuncio_titulo` (1 a 200 caracteres) y `ck_anuncio_cuerpo` (1 a 5000), sin espacios al inicio ni al final, como `ck_evaluacion_nombre`.
- Índice `ix_anuncio_curso_fecha` para el listado de un curso.
- RLS: cada universidad lee sus anuncios y el Director los de todas; solo el rol `PROFESOR` inserta o modifica, en su universidad. ANU-01 no expone ningún `UPDATE`; la política queda para archivar anuncios, como en el resto de las tablas. Sin `DELETE`.

## Revisión en local

Con los datos del seed (GES-20), el curso ICC101 de Ingeniería Norte tiene dos secciones con profesores distintos. La contraseña de todos es `SEED_PASSWORD` de `.env` (`cursus_demo` con el ejemplo).

1. `docker compose up -d --wait`, `npm run migration:run --workspace=backend` y `npm run seed --workspace=backend`. En dos terminales, `npm run dev:back` y `npm run dev:front`, y abrir `http://localhost:5173`.
2. Ingresar con `camila.rojas@norte.cursus.test` (profesora de ICC101 sección 1). En el Dashboard, abrir ICC101 sección 1 y la pestaña **Anuncios**.
3. Publicar sin mensaje: el navegador lo pide. Publicar con título y un mensaje de dos líneas: aparece el aviso y el anuncio queda arriba, con autor, fecha y los dos renglones.
4. Cerrar sesión e ingresar con `constanza.castro@norte.cursus.test` (alumna de la sección 2, con otro profesor). En ICC101 sección 2, pestaña **Anuncios**: aparece el anuncio de Camila, sin formulario.
5. Repetir con `sofia.contreras@norte.cursus.test` (ayudante de la sección 2): lo ve, sin formulario.
6. Ingresar con `matias.munoz@norte.cursus.test` (profesor de la sección 2) y publicar otro desde su sección: en la sección 1 se ven los dos, el suyo primero. En ICC201 sección 1, otro curso de Matías, no aparece ninguno.

## Pruebas automáticas

```bash
npm run lint
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
npm run build
```

- `backend/test/anuncios/anuncios.db-spec.ts`, con PostgreSQL real en una base propia:
  - publicar con autor y fecha;
  - que lo vean alumnos, ayudantes y el otro profesor de otra sección del mismo curso, y el Director;
  - que el cuerpo conserve sus saltos de línea y el título quede en una línea;
  - que otro profesor del curso también publique, con el orden del más nuevo al más antiguo;
  - que no aparezca en otro curso ni se muestren los archivados;
  - los 400 de título y cuerpo (incluido el NUL), los 403 y 404 de quién no publica ni lee, y el 403 si el profesor dejó la sección;
  - en la base: RLS aísla los anuncios por universidad e impide insertar a un alumno, `fk_anuncio_autor` rechaza un autor de otra universidad, y los CHECK rechazan título o cuerpo vacíos.
- `backend/test/anuncios/anuncios.e2e-spec.ts`: 403 al publicar por rol, 403 al leer para el Administrativo, 401 sin sesión y 400 con un id inválido.
- `frontend/src/pages/PestanaAnuncios.test.tsx`: la lista con autor, fecha y saltos de línea; el formulario solo para el profesor; publicar, el aviso y la recarga; el mensaje del 400; el 403; el estado vacío y el error de carga. `VistaSeccion.test.tsx` comprueba que Anuncios es la única pestaña habilitada.
- `src/auth/permisos.spec.ts` incluye `Anuncio` en la matriz; `esquema-inicial.db-spec.ts` revierte la migración nueva, y `rls.db-spec.ts` agrega la tabla al contrato del schema.

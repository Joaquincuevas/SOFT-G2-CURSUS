# NOT-10: el profesor ve las evaluaciones pendientes de revisión

Tarjeta: [F4 · NOT-10](https://trello.com/c/i8ArJRxi). Depende de NOT-07 (`revision_notas`) y NOT-08 (envío a revisión), ya integradas en `develop`.

**Como** profesor, **quiero** ver las evaluaciones pendientes de revisión, **para** saber qué notas debo validar.

## Criterios

| Criterio                                                                                        | Cómo se cumple                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Se listan las evaluaciones enviadas a revisión en mis secciones, con ayudante y fecha de envío. | `GET /api/dashboard/pendientes-revision` y la página **Evaluaciones pendientes de revisión** (`/mis-cursos/pendientes-revision`). |
| El dashboard del profesor muestra cuántas evaluaciones tiene pendientes.                        | `mis-secciones` trae `pendientesRevision` por sección; el dashboard muestra el total y cada tarjeta el suyo, sin otra petición.   |
| Al abrir una pendiente se ven todas las notas propuestas.                                       | "Ver notas" abre la tabla de NOT-05 con el GET de notas. En `EN_REVISION` queda en solo lectura y sin botones.                    |

## Comportamiento

- **Dashboard del profesor**, sobre las tarjetas:
  - con pendientes: "3 evaluaciones pendientes de revisión." y el enlace **Ver pendientes**;
  - sin pendientes: "No tienes evaluaciones pendientes de revisión.", sin enlace;
  - sin secciones a su cargo, el aviso no aparece.

  Cada tarjeta con pendientes dice cuántas tiene ("1 evaluación pendiente de revisión").

- **Página de pendientes**, de la más antigua a la más nueva por fecha de envío. Una fila por evaluación con:
  - curso, sección y evaluación;
  - ayudante y fecha del último envío, en la hora local;
  - "(1 alumno sin nota)" si hay alumnos activos sin nota, por ejemplo uno inscrito después del envío (NOT-08).

  También muestra la carga, la lista vacía y el error con **Reintentar**. Otro rol que entra por la URL lee "Solo el profesor ve las evaluaciones pendientes de revisión.", sin reintentar.

- **Ver notas** abre la tabla de la evaluación bajo su fila, con "Estado: En revisión" y todas las notas propuestas en solo lectura. Volver a pulsar la cierra.

Aprobar y devolver quedan para NOT-11 y NOT-12.

## API

`GET /api/dashboard/pendientes-revision` devuelve `PendienteRevision[]` (`@cursus/shared`):

```ts
{
  evaluacion: { id, nombre, fecha }
  seccion: { id, numero }
  curso: { id, codigo, nombre }
  ayudante: { id, nombre } | null   // último ENVIO
  enviadaEl: string | null          // ISO 8601, fecha del último ENVIO
  sinNota: number                   // alumnos activos sin nota activa
}
```

| Resultado | Cuándo                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **200**   | El profesor, con sus pendientes (o una lista vacía).                                                                                           |
| **403**   | El ayudante, el alumno, el Administrativo y el Director. El Director no tiene secciones a cargo y ya lee cada evaluación por la API de NOT-05. |
| **401**   | Sin sesión.                                                                                                                                    |

La lista no recibe ids, así que no tiene 404: las pendientes de otra universidad no aparecen. Abrir una con el GET de notas de NOT-05 sí responde 404 a un profesor de otra universidad.

`GET /api/dashboard/mis-secciones` (ESP-01) agrega `pendientesRevision` a cada tarjeta.

### Qué cuenta como pendiente

Una evaluación con `revision_notas.estado = 'EN_REVISION'` que:

- no está archivada;
- es de una sección vigente a cargo del profesor (`seccion.profesor_id`);
- es de un curso vigente del **período activo** de su universidad.

No aparecen las evaluaciones en `BORRADOR` (con o sin fila), `DEVUELTA` ni `APROBADA`.

**Período cerrado:** una evaluación `EN_REVISION` de un período que ya cerró sigue en revisión en la base, pero deja de aparecer en la lista y en el contador, como el resto del dashboard. Si hace falta revisarla, se abre desde la sección.

La lista y el contador usan los mismos fragmentos SQL de `backend/src/dashboard/pendientes.sql.ts`, así que no pueden diferir:

- `SECCIONES_DEL_PROFESOR`: las secciones del profesor. Cuando GES-25 permita varios profesores por sección, es el único lugar que hay que cambiar.
- `EN_REVISION_DE_SECCION`: las evaluaciones en revisión de cada sección.

### Ayudante y fecha del envío

Salen del **último evento `ENVIO` de `nota_cambio`** (`responsable_id` y `fecha`, el último por `fecha` e `id`), no de `revision_notas.actualizado_por` ni de `updated_at`:

- `nota_cambio` no se reescribe, mientras que esas columnas guardan el último cambio de cualquier tipo, y NOT-11, NOT-12 y NOT-15 también las van a escribir;
- tras una devolución (NOT-12) y un reenvío, vale el último `ENVIO`, aunque lo haga otro ayudante.

Es un registro histórico: se muestra a quien envió aunque después lo hayan quitado de la sección o archivado.

Con `alumno_id IS NULL` (los eventos `ENVIO` no llevan alumno), la consulta usa `ix_nota_cambio_evaluacion_alumno_fecha` y lee una sola entrada. Una evaluación en revisión sin evento `ENVIO`, que solo puede quedar así si alguien cambia la fila fuera de la API, aparece con `ayudante` y `enviadaEl` en `null` ("—" en la pantalla).

## Datos

Sin migración: los índices existentes bastan. La RLS de NOT-07 y NOT-04 ya deja leer `revision_notas` y `nota_cambio` al profesor de la universidad.

## Verificación

Desde la raíz, con Node 24.15+, dependencias instaladas y PostgreSQL disponible:

```bash
npm run lint
npm run build
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
```

- `backend/test/dashboard/pendientes-revision.db-spec.ts`:
  - solo aparecen las evaluaciones `EN_REVISION` de las secciones del profesor, de la más antigua a la más nueva;
  - no aparecen sin fila, en `BORRADOR`, `DEVUELTA` ni `APROBADA`, archivadas, de otro profesor, de una sección o un curso archivados, ni de otra universidad;
  - cada pendiente trae el último envío (otro ayudante, si reenvió) y los alumnos sin nota, y un alumno inscrito después cuenta como sin nota;
  - el contador de `mis-secciones` coincide con la lista, por sección y en total;
  - con el período cerrado, la evaluación sigue `EN_REVISION` pero no aparece en la lista ni en el contador;
  - el ayudante, el alumno, el Administrativo y el Director reciben 403;
  - el profesor abre la pendiente con todas las notas propuestas y el de otra universidad recibe 404;
  - por la API: enviar, devolver (como dueño de la tabla, porque NOT-12 aún no existe) y reenviar con otro ayudante deja dos eventos, y la lista muestra el último.
- `backend/test/dashboard/pendientes-revision.e2e-spec.ts`: 401, 403 por rol y sin otras rutas.
- `backend/test/dashboard/mis-secciones.db-spec.ts`: la tarjeta trae `pendientesRevision`.
- `frontend/src/pages/PendientesRevision.test.tsx`: la lista con sus columnas y los alumnos sin nota, el vacío, el error con reintento, el 403 de otro rol, abrir una pendiente en solo lectura, y el contador del dashboard (total, por tarjeta, enlace, sin pedir la lista, sin pendientes y sin secciones).

## Revisión en local

1. Levantar backend y frontend con las migraciones y el seed de facultad completa.
2. Como ayudante, ingresar todas las notas de una evaluación y enviarla a revisión (NOT-08).
3. Como profesor de la sección, abrir el **Dashboard**: se lee "1 evaluación pendiente de revisión." y la tarjeta de la sección dice lo mismo.
4. Pulsar **Ver pendientes**: aparece la evaluación con el ayudante y la fecha del envío.
5. Pulsar **Ver notas**: se ven todas las notas, en solo lectura, con "Estado: En revisión".

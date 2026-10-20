# GES-14: quitar al profesor o a un ayudante de una sección

Historia: **F2 · [GES-14] Administrativo quita a un profesor o ayudante de una sección**. Referencia: RN-05. Dependencias: GES-12 (#55) y GES-13 (#50), ya integradas en `develop`.

## Comportamiento

En el detalle del curso, cada sección con profesor ofrece **Quitar profesor**, y cada sección con ayudantes ofrece **Quitar ayudante**, solo al Administrativo. Los dos abren una confirmación que pide el **motivo** (obligatorio, hasta 500 caracteres). Para un ayudante, además se elige a quién quitar entre los asignados.

Al confirmar:

- **Profesor:** la sección queda sin profesor y la tabla muestra "Sin asignar". Se puede asignar otro con GES-12.
- **Ayudante:** su asignación se archiva y la tabla muestra los que quedan. Se puede volver a asignar con GES-13.

Nada se elimina. Cada baja queda en el historial de asignaciones con la fecha, el responsable, la persona quitada y el motivo, en la misma transacción que el cambio: si no se puede registrar el historial, la asignación no cambia.

El Administrativo solo puede quitar asignaciones de secciones vigentes de cursos de su facultad. Una sección ajena, inexistente o archivada responde 404, igual que una sección sin profesor o un ayudante que no está asignado. El Director y los demás roles reciben 403.

## API y datos

- `PATCH /api/secciones/:id/profesor/quitar`, con `{ motivo }`: responde 200 con `{ quitado, quitadoEn, quitadoPor, motivo }` (`AsignacionQuitada`).
- `PATCH /api/secciones/:id/ayudantes/:usuarioId/quitar`, con `{ motivo }`: responde 200 con lo mismo, más los ayudantes que siguen asignados (`AyudanteQuitado`).
- Las dos rutas requieren `update` sobre `Seccion` (solo el Administrativo). Son `PATCH` y no `DELETE`, porque nada se elimina. Un motivo vacío o de solo espacios, de más de 500 caracteres o un campo extra responden 400. El motivo se guarda sin espacios al inicio ni al final.

La migración `1792510000000-CrearAsignacionCambio` crea `asignacion_cambio`:

| Columna          | Detalle                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| `tipo`           | `PROFESOR` o `AYUDANTE`                                                  |
| `anterior_id`    | Quién estaba asignado                                                    |
| `nuevo_id`       | Quién quedó. Al quitar es `NULL`; queda lista para registrar reemplazos. |
| `responsable_id` | Quién hizo el cambio                                                     |
| `motivo`         | Entre 1 y 500 caracteres                                                 |
| `fecha`          | `clock_timestamp()` de la base                                           |

- Las claves foráneas compuestas aseguran que la sección y las personas sean de la misma universidad.
- Es de **solo adición**, como `curso_cambio` (GES-07): la API tiene `SELECT` e `INSERT`, sin `UPDATE` ni `DELETE`.
- RLS: el Administrativo lee y registra cambios de su universidad; el Director lee los de todas, en solo lectura (ADR 0001); los demás roles no los leen.
- GES-19 no usa esta tabla: registra quién y cuándo quitó a un alumno en la misma fila de `inscripcion` (`archived_at` y `archivada_por`).

## Verificación

Desde la raíz, con Node 24.15+, dependencias instaladas y PostgreSQL disponible:

```bash
npm run lint
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
npm run build
```

- `backend/test/gestion/quitar-asignacion.db-spec.ts`: cada criterio de aceptación, aislamiento entre universidades y facultades, sección archivada, validación del motivo, que el cambio y el historial se guardan juntos o ninguno, volver a asignar, RLS del historial y sus restricciones.
- `backend/test/gestion/quitar-asignacion.e2e-spec.ts`: permisos por rol, sesión y validación del body.
- `frontend/src/pages/QuitarAsignacion.test.tsx`: confirmación con motivo, actualización de la tabla, cancelar, errores y que el diálogo no se cierre mientras se envía.

## Revisión en local

1. Ejecutar las migraciones (`npm run migration:run --workspace=backend`) y el seed (`npm run seed --workspace=backend`). Levantar backend y frontend.
2. Ingresar con `administrativo.ingenieria@norte.cursus.test` y la contraseña `SEED_PASSWORD` del `.env`.
3. Abrir Gestión académica, un curso, y asignar un profesor y dos ayudantes a la sección 1 (GES-12 y GES-13).
4. **Quitar profesor:** el botón Quitar queda deshabilitado sin motivo. Escribir un motivo y confirmar: la sección muestra "Sin asignar" y vuelve a ofrecer Asignar profesor.
5. **Quitar ayudante:** elegir uno de los dos, escribir un motivo y confirmar: la sección muestra solo al otro. Recargar: el cambio se mantiene.
6. Revisar el historial en la consola SQL: `SELECT tipo, anterior_id, responsable_id, motivo, fecha FROM asignacion_cambio ORDER BY fecha;`.
7. Ingresar como Director y abrir el curso: no debe ver los botones para quitar.

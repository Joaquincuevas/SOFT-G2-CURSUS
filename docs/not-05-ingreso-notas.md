# NOT-05: el ayudante ingresa las notas de una evaluación

Tarjeta: [F4 · NOT-05 Ayudante ingresa las notas de una evaluación](https://trello.com/c/hqacBDTT). Referencia: RN-10. Depende de NOT-01 (evaluaciones) y NOT-04 (auditoría de notas), ya integradas en `develop`.

## Comportamiento

En la pestaña **Notas** de la vista de la sección, el ayudante ve una columna **Notas** con un botón **Ingresar notas** por evaluación. Al pulsarlo se abre, debajo de la lista, una tabla con todos los alumnos activos de la sección (por nombre), un campo de nota por alumno y su estado ("Sin nota" o "Propuesta").

- **Guardar notas** envía solo los campos que cambiaron y queda deshabilitado si no hay cambios, mientras guarda y hasta que llega la recarga (un doble clic no envía dos veces).
- **Guardado parcial:** se pueden guardar unas pocas notas y volver después por el resto; al volver se recuperan las guardadas. Un campo vacío no borra una nota: nada se elimina.
- Las notas quedan en estado **propuesta**, que el alumno no ve.
- Una nota publicada (NOT-11) aparece como "Publicada" y su campo no se edita: cambiarla es una recorrección del profesor (NOT-15).
- El profesor, el alumno y el Director no ven el botón ni ningún campo de nota. El profesor revisa las propuestas en NOT-10.

| Quién                                 | Lee (GET) | Guarda (PUT) |
| ------------------------------------- | --------- | ------------ |
| Un ayudante de la sección             | Sí        | Sí           |
| El profesor de la sección             | Sí        | 403          |
| El Director (solo lectura, ADR 0001)  | Sí        | 403          |
| Los alumnos (ven las suyas en NOT-13) | 403       | 403          |
| El Administrativo                     | 403       | 403          |
| Un ayudante de otra sección           | 403       | 403          |

La lista **no incluye correos**: la lee el ayudante (RE-10, igual que en ESP-05 y ASI-02).

## API

| Método | Ruta                                                          | Cuerpo                            | Resultado              |
| ------ | ------------------------------------------------------------- | --------------------------------- | ---------------------- |
| GET    | `/api/espacio/secciones/:id/evaluaciones/:evaluacionId/notas` | Ninguno                           | 200, `NotasEvaluacion` |
| PUT    | `/api/espacio/secciones/:id/evaluaciones/:evaluacionId/notas` | `{ notas: [{ alumnoId, nota }] }` | 200, `NotasEvaluacion` |

`NotasEvaluacion` (`@cursus/shared`) es `{ evaluacion, alumnos: { id, nombre, nota, estado }[] }`, con `nota` y `estado` en `null` para quien aún no tiene nota.

Guardar es `PUT`: enviar las mismas notas otra vez no cambia nada ni deja eventos en la auditoría, así que es idempotente.

El PUT:

- Acepta **cualquier subconjunto** de los alumnos activos (incluso una lista vacía); los que no vienen conservan su nota. **Hasta 500 notas por guardado** (`MAX_NOTAS_GUARDADO`, más que los alumnos de cualquier sección): una lista más larga responde 400 por la validación del cuerpo, sin llegar al servicio.
- **Valida todas las notas antes de escribir.** Una nota que no va de 1,0 a 7,0 con un decimal (0, 8, 5,55, `"x"`) responde **400 "Nota inválida"** y no guarda ninguna, aunque las demás sean válidas. La base lo vuelve a exigir con `ck_nota_valor`. Los mensajes por campo y la marca en rojo son NOT-06.
- 400 con `{ message, sobrantes, repetidos }` si trae alumnos sin inscripción activa en la sección o repetidos (los UUID se comparan en minúsculas). No guarda nada.
- 400 **"Una nota publicada no se cambia desde aquí"** si la lista incluye a un alumno cuya nota está `PUBLICADA`, aunque traiga el mismo valor: se rechaza **la lista completa** antes de escribir, así que tampoco se guardan las demás notas ni queda ningún evento. Publicar es NOT-11 y recorregir, NOT-15.
- 400 por un cuerpo mal formado (sin `notas`, `alumnoId` que no es UUID, nota nula o ausente, campos extra).
- 404 si la evaluación no existe, está archivada o es de otra sección.
- 403 si quien guarda no es ayudante de la sección. Se vuelve a comprobar dentro de la transacción, con una asignación activa en `ayudante_seccion`.
- **Todo en una transacción.** Cada nota que cambia se guarda como propuesta y deja un evento `PROPUESTA` en `nota_cambio` con `AuditoriaNotasService.registrar()` (NOT-04): la primera vez con nota anterior nula, y al cambiarla con la anterior. Una nota igual a la guardada no deja evento ni toca la fila.
- Si el `UPDATE` de una propuesta no modifica la fila (por ejemplo, porque la RLS la omite sin error), responde 500 y revierte todo, también el evento ya registrado, en vez de responder 200 con la nota sin cambiar.
- **Un guardado a la vez por evaluación**, con `pg_advisory_xact_lock` sobre `notas:<evaluacionId>` (el id en minúsculas, porque la ruta también lo acepta en mayúsculas): así la nota anterior de la auditoría es siempre la última guardada. No se usa `FOR UPDATE` sobre `evaluacion` porque su RLS solo deja modificarla (y bloquear sus filas) al profesor. Las inscripciones se leen fijadas con `FOR SHARE`, como en ASI-02.

## Datos

La migración `1792660000000-CrearNota` crea `nota`: `universidad_id`, `evaluacion_id`, `alumno_id`, `valor` (`numeric(2,1)`), `estado`, `propuesta_por`, `archived_at`, `created_at` y `updated_at`.

- FKs compuestas por universidad a `evaluacion` (con `uq_evaluacion_id_universidad` de NOT-04), al alumno y al ayudante.
- `ck_nota_valor`: de 1,0 a 7,0, como `nota_cambio`. `ck_nota_estado`: `PROPUESTA` o `PUBLICADA`; esta tarjeta solo escribe `PROPUESTA`.
- Índice único `(evaluacion_id, alumno_id) WHERE archived_at IS NULL`: una nota activa por alumno en cada evaluación.
- Cambiar una propuesta es un `UPDATE` del valor: la historia completa queda en `nota_cambio`.
- `GRANT SELECT, INSERT, UPDATE`, sin DELETE.
- `tg_nota_auditar_superadmin` (MT-04): un `INSERT` o `UPDATE` hecho por el superadmin queda en `superadmin_cambio`, como en las demás tablas con `universidad_id`. Usa `superadmin_actual()` y `auditar_superadmin()` de `CrearSuperadminCambio`, así que la migración va después de las cuatro de MT-04 (`1792650000000` a `1792653000000`) y, al revertir, sale antes que ellas. `down` quita el trigger antes de borrar la tabla.

**RLS** (ENABLE y no FORCE, como `evaluacion`):

- **Lectura igual que `nota_cambio`:** el profesor y el ayudante de la universidad, y el Director en cualquiera (solo lectura). **El alumno y el Administrativo no ven ninguna fila**, ni siquiera una nota publicada: aunque un endpoint olvide filtrar, la base no les entrega propuestas.
- Inserción y modificación: en la universidad, solo con rol `AYUDANTE` y solo de propuestas. La política exige `estado = 'PROPUESTA'` en el `WITH CHECK` del INSERT y en el `USING` y el `WITH CHECK` del UPDATE: un ayudante no crea una nota publicada, no publica una propuesta y no modifica una publicada. Insertar una publicada o publicar una propuesta falla con un error de RLS; el UPDATE de una fila publicada no la alcanza (PostgreSQL omite sin error las filas que no pasan el `USING`).
- **Alcance de la escritura a nivel de base: por universidad y rol, no por sección.** No hay función de contexto para el usuario de la sesión, así que la base no sabe de qué secciones es ayudante quien escribe: un ayudante de la misma universidad pasaría la política en cualquier evaluación. Que sea ayudante de **esa** sección lo exige el servicio (el guard de ESP-06 y una comprobación en la transacción contra `ayudante_seccion`), igual que en `evaluacion`, `clase` y `asistencia` con el profesor. Esto lo retoman:
  - **NOT-11:** publicar necesita que el profesor escriba `PUBLICADA`, así que agregará su propia política de UPDATE (con rol `PROFESOR`), sin abrir la del ayudante.
  - **NOT-13:** si agrega `usuario_actual()` para la lectura del alumno, la misma función permitiría restringir también la escritura a la sección (por ejemplo, exigir una asignación activa en `ayudante_seccion`).
- **Cómo lee el alumno sus notas publicadas lo decide NOT-13.** No hay función de contexto para el usuario de la sesión: una opción es agregar `usuario_actual()` y una política `alumno_id = usuario_actual() AND estado = 'PUBLICADA'`; la otra, que el alumno lea con una consulta que filtre por su id. Mientras tanto, el rol `ALUMNO` no tiene lectura.

Nuevo sujeto CASL `Nota` en `shared/src/permisos.ts`: el ayudante tiene `update` y `read`; el profesor y el Director, `read`.

## Verificación

Desde la raíz, con Node 24.15+, dependencias instaladas y PostgreSQL disponible:

```bash
npm run lint
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
npm run build
```

- `backend/test/notas/notas.db-spec.ts`:
  - lectura: todos los alumnos activos por nombre y sin correo; lectura del profesor y del Director; 403 al alumno, al Administrativo y a un ayudante de otra sección; 404 a otra universidad y a una evaluación de otra sección, archivada o inexistente;
  - guardado: propuesta con un evento por nota y nota anterior nula; guardado parcial (2 de 5 y después los otros 3 conserva las dos primeras); la misma nota no deja evento y cambiarla deja la anterior; lista vacía;
  - "Nota inválida" para 0, 8, 5,55 y `"x"` sin filas ni eventos, una lista con una válida y una inválida que no guarda nada, y una inválida que no toca una nota existente;
  - alumnos no inscritos, retirados o repetidos; cuerpos mal formados; nota publicada; 403 para profesor, alumno, Administrativo, Director y ayudante de otra sección, también a un ayudante al que le quitaron la sección; 404 para otra universidad;
  - dos ayudantes que guardan a la vez (llegan a la vez porque el test fija las inscripciones hasta que los dos esperan): la auditoría encadena las notas;
  - que las evaluaciones, el resumen de la sección y el dashboard del alumno no incluyen notas;
  - CHECK (7,5, 0,9 y un estado inválido), FK de otra universidad y una nota activa por alumno;
  - RLS: profesor y ayudante leen, el Director lee en cualquier universidad, el alumno ve 0 filas (incluida su nota publicada), el Administrativo 0 y otra universidad 0; solo el ayudante inserta; el ayudante no inserta una nota publicada ni publica una propuesta (error de RLS) y su UPDATE no alcanza una publicada; el UPDATE del alumno no alcanza filas; sin DELETE.
- `backend/test/notas/notas.e2e-spec.ts`: 401, 403 por CASL y sin rutas POST, PATCH ni DELETE.
- `frontend/src/pages/NotasDeEvaluacion.test.tsx`: tabla con todos los alumnos, guardado solo de lo que cambió, botón deshabilitado al recargar, 400 "Nota inválida", nota publicada sin editar, sección sin alumnos, error con reintento, y que el profesor, el alumno y el Director no ven el botón ni campos de nota.

## Revisión en local

1. Ejecutar las migraciones y el seed de facultad completa. Levantar backend y frontend.
2. Como profesor (`camila.rojas@norte.cursus.test`, contraseña `SEED_PASSWORD`), crear una evaluación en una sección.
3. Ingresar como un ayudante de esa sección, abrir la pestaña **Notas** y pulsar **Ingresar notas**. Escribir dos notas y guardar: quedan como "Propuesta". Volver a abrir: siguen ahí.
4. Escribir un 8 y guardar: aparece "Nota inválida." y no se guarda nada.
5. Ingresar como alumno de la sección: la pestaña Notas muestra la evaluación, sin notas.

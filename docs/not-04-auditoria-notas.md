# NOT-04: registro de auditoría de cada propuesta, aprobación y cambio de nota

Tarjeta: [F4 · NOT-04 Registro de auditoría de cada propuesta, aprobación y cambio de nota](https://trello.com/c/JqiCWQmi). Referencia: RN-12. Sin dependencias dentro de la fase.

## Comportamiento

Cada acción sobre las notas queda como un **evento** en la tabla `nota_cambio`. Los eventos no se editan ni se borran: la tabla es de solo adición, igual que `curso_cambio` (GES-07) y `asignacion_cambio` (GES-14).

Esta tarjeta deja la tabla y el servicio que la usan; las tarjetas de notas registran sus eventos:

| Tipo           | Lo registra                           | Alcance       | Nota anterior | Nota nueva  | Motivo      |
| -------------- | ------------------------------------- | ------------- | ------------- | ----------- | ----------- |
| `PROPUESTA`    | NOT-05 y NOT-07 (cada nota ingresada) | Un alumno     | Opcional¹     | Obligatoria | —           |
| `ENVIO`        | NOT-08 (envío a revisión)             | La evaluación | —             | —           | —           |
| `APROBACION`   | NOT-11 (aprobar y publicar)           | La evaluación | —             | —           | —           |
| `DEVOLUCION`   | NOT-12 (devolver al ayudante)         | La evaluación | —             | —           | Obligatorio |
| `RECORRECCION` | NOT-15 (cambiar una nota publicada)   | Un alumno     | Obligatoria   | Obligatoria | Obligatorio |

¹ Nula en la primera propuesta de esa nota.

Cada evento guarda además **quién** hizo la acción (`usuario_id`) y **cuándo** (`created_at`). El envío, la aprobación y la devolución son de toda la evaluación (`alumno_id` nulo): ocurren una vez y así lo piden NOT-08, NOT-11 y NOT-12. El historial de una nota (NOT-16) une los eventos de ese alumno con los de su evaluación:

```sql
WHERE evaluacion_id = $evaluacion AND (alumno_id = $alumno OR alumno_id IS NULL)
ORDER BY created_at
```

Sin endpoints ni pantalla: leer el historial es NOT-16.

## Servicio

`AuditoriaNotasService` (`backend/src/notas/auditoria-notas.service.ts`), exportado desde `NotasModule`:

```ts
registrar(bd, evento): Promise<string | null>
// evento = { universidadId, evaluacionId, alumnoId?, tipo, notaAnterior?, notaNueva?, motivo?, usuarioId }
```

- `bd` es la conexión de la **transacción en curso** (la que entrega `BaseDeDatos.enTransaccionEnUniversidad`). Así el evento queda junto con el cambio de la nota: si la transacción se revierte, el evento tampoco queda.
- **Una `PROPUESTA` solo se registra si la nota cambia** (`notaAnterior` distinta de `notaNueva`). Guardar varias veces el mismo borrador (NOT-07) no llena la auditoría de filas iguales; en ese caso devuelve `null` y no inserta nada. La base lo vuelve a exigir con un CHECK.
- Las notas se aceptan como número o como el string que PostgreSQL devuelve para un `numeric`, y se comparan ya normalizadas. Una nota que no va de 1,0 a 7,0 con un decimal (por ejemplo 5,54 o 0,95, que la columna `numeric(2,1)` redondearía) lanza `RangeError` antes de tocar la base, para no abortar la transacción de quien llama con un error de CHECK.
- Devuelve el id del evento registrado.

Los tipos (`TipoEventoNota`, `TIPOS_EVENTO_NOTA`) y el rango de las notas (`NOTA_MINIMA`, `NOTA_MAXIMA`) están en `@cursus/shared`.

## Datos

La migración `1792570000000-CrearNotaCambio` crea `nota_cambio`:

- `id`, `universidad_id`, `evaluacion_id`, `alumno_id` (nulo en los eventos de la evaluación), `tipo`, `nota_anterior` y `nota_nueva` (`numeric(2,1)`), `motivo`, `usuario_id` y `created_at`. Sin `updated_at` ni `archived_at`: un evento no cambia.
- FKs compuestas por universidad a `evaluacion`, al alumno y al usuario (agrega `uq_evaluacion_id_universidad`).
- CHECK: el tipo en la lista cerrada; las notas entre 1,0 y 7,0; alumno y notas según el tipo (tabla de arriba); y motivo obligatorio en devolución y recorrección, de 1 a 500 caracteres.
- Índice `(evaluacion_id, alumno_id, created_at)` para el historial.

**Solo adición, en tres capas:**

1. `GRANT SELECT, INSERT` a `cursus_app`: sin UPDATE, DELETE ni TRUNCATE.
2. RLS sin política de UPDATE ni DELETE. Lectura en la universidad, o en cualquiera para el Director (solo lectura, ADR 0001). Inserción en la universidad y solo con rol `PROFESOR` o `AYUDANTE`; qué rol registra cada tipo lo valida cada tarjeta.
3. Trigger `BEFORE UPDATE OR DELETE` por fila que lanza un error, también para el dueño de la tabla. No hay trigger de TRUNCATE: `cursus_app` no tiene ese privilegio (lo verifica `rls.db-spec.ts`) y los tests limpian con `TRUNCATE universidad CASCADE`, que no dispara triggers de fila.

## Verificación

Desde la raíz, con Node 24.15+, dependencias instaladas y PostgreSQL disponible:

```bash
npm run lint
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
npm run build
```

`backend/test/notas/auditoria-notas.db-spec.ts` registra con la conexión real de la API (`cursus_app` y RLS) y cubre: un evento válido de cada tipo; que una propuesta con la misma nota no registra nada y una distinta sí; que un evento registrado en una transacción que se revierte no queda; los CHECK (rango, tipo, motivo obligatorio y alumno y notas según el tipo); la FK de otra universidad; que UPDATE y DELETE fallan por permiso (`has_table_privilege` y como `cursus_app`) y por el trigger (como dueño); y la RLS entre universidades, la lectura del Director y la inserción con un rol no permitido. `esquema-inicial.db-spec.ts` aplica y revierte la migración y `rls.db-spec.ts` incluye la tabla en el contrato de auditorías (solo SELECT e INSERT).

## Revisión

1. Revisar la migración: CHECK de alcance y motivo, GRANT sin UPDATE ni DELETE, políticas y trigger.
2. Revisar que `registrar()` no inserte una propuesta sin cambio y use la conexión que recibe (no abre una transacción propia).
3. Correr `npm run test:db --workspace=backend` y confirmar que pasan `auditoria-notas`, `esquema-inicial` y `rls`.

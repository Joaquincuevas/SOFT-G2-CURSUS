# NOT-14: nota final calculada automáticamente

Tarjeta: [F4 · NOT-14](https://trello.com/c/YSk5tG3X). Depende de NOT-13 (el alumno ve sus notas publicadas), ya integrada en `develop`.

**Como** alumno, **quiero** que mi nota final se calcule automáticamente y pueda verla, **para** saber cómo voy en el curso.

## Criterios

| Criterio                                                                                 | Cómo se cumple                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La nota final es el promedio ponderado de las notas publicadas, redondeado a un decimal. | `calcularNotaFinal` (`backend/src/notas/nota-final.ts`) promedia las notas `PUBLICADA` con su ponderación y redondea a la décima, la mitad hacia arriba (5,05 → 5,1).                     |
| Mientras falten evaluaciones, se muestra como "nota parcial" con el porcentaje evaluado. | Si alguna evaluación activa no tiene nota publicada, `tipo` es `PARCIAL` y `porcentajeEvaluado` suma las ponderaciones ya evaluadas. La pantalla dice "Nota parcial 5,0 (60 % evaluado)". |
| El cálculo se hace en el backend y es el mismo que ve el profesor.                       | `mis-notas` (alumno) y el nuevo `notas-finales` (profesor) llaman a la misma función, con el mismo filtro de nota publicada. El frontend solo formatea.                                   |

## Regla de cálculo

Para cada alumno, con las evaluaciones **activas** de la sección:

- `porcentajeEvaluado` = suma de las ponderaciones de las evaluaciones con nota publicada.
- `nota` = Σ(nota × ponderación) / `porcentajeEvaluado`, redondeada a un decimal; `null` si aún no hay notas publicadas.
- `tipo` = `FINAL` solo si todas las evaluaciones activas tienen nota publicada **y** las ponderaciones suman 100 (RN-10, NOT-02). Si no, `PARCIAL`.

Las notas tienen un decimal y las ponderaciones son enteras, así que el cálculo se hace en décimas con enteros: no hay errores de punto flotante al redondear (en JavaScript, `Math.round(5.05 * 10)` daría 50).

No cuentan las notas propuestas (borrador, en revisión, devueltas), las notas archivadas ni las evaluaciones archivadas. Una nota recorregida (NOT-15) cuenta con su valor nuevo.

## Comportamiento

- **Alumno**, en **Mis cursos** → un curso → pestaña **Notas**: sobre la tabla de **Mis notas** aparece "Nota final 5,1", "Nota parcial 5,0 (60 % evaluado)" o "Sin notas publicadas". Sin evaluaciones, sigue diciendo "Aún no hay evaluaciones".
- **Profesor**, en la misma pestaña: bajo la lista de evaluaciones aparece **Notas finales**, una tabla con cada alumno activo por nombre y el mismo texto. Se vuelve a pedir cada vez que el detalle de una evaluación lee o cambia sus notas (al abrirlo, aprobar, devolver o recorregir), sin borrar la tabla mientras llega.
- El ayudante, el Administrativo y el Director no ven la tabla.

## Decisiones

- **Se calcula al vuelo, no se guarda.** No hay migración, tabla ni botón para "publicar la nota final". La validación de NOT-02 (`PonderacionesService.conNotaFinalValidada`) sigue sin uso: queda para la tarjeta que agregue ese cierre. Mientras las ponderaciones no sumen 100, la nota se muestra como parcial, así que nunca aparece una "nota final" con ponderaciones inválidas.
- **Solo el profesor de la sección ve las notas finales de todos.** El ayudante lee propuestas por evaluación, pero el consolidado del curso es del profesor. Si el Director lo necesita, se agrega en otra tarjeta.
- **Sin evaluaciones el alumno no ve la línea de nota**, solo "Aún no hay evaluaciones"; el endpoint igual responde `notaFinal` con `nota: null`.
- **Para las próximas tarjetas:** HIS-05 (notas de períodos anteriores) y EXP-01 (exportar a CSV) deben usar `calcularNotaFinal` en vez de recalcular.

## API

### `GET /api/espacio/secciones/:id/mis-notas` (cambia)

La respuesta `MisNotasSeccion` de NOT-13 agrega `notaFinal`:

```json
{
  "evaluaciones": [ … ],
  "notaFinal": { "tipo": "PARCIAL", "nota": 5, "porcentajeEvaluado": 60 }
}
```

Permisos y errores, igual que en NOT-13.

### `GET /api/espacio/secciones/:id/notas-finales` (nueva)

Responde `NotasFinalesSeccion` de `@cursus/shared`, con los alumnos activos de la sección por nombre (`es-CL`), sin correos:

```json
{
  "alumnos": [
    {
      "id": "…",
      "nombre": "Ana Ávila",
      "notaFinal": { "tipo": "FINAL", "nota": 5.1, "porcentajeEvaluado": 100 }
    }
  ]
}
```

| Resultado | Cuándo                                                                              |
| --------- | ----------------------------------------------------------------------------------- |
| **200**   | Un profesor vigente de la sección.                                                  |
| **403**   | Un ayudante, un alumno o el Administrativo; un profesor que ya no es de la sección. |
| **404**   | La sección no existe, está archivada o es de otra universidad.                      |
| **401**   | Sin sesión.                                                                         |

Permisos:

- **CASL:** `@Puede('read', 'Nota')`; el alumno y el Administrativo reciben 403 antes de llegar a la base.
- **Sección:** `IntegranteSeccionGuard`, y el servicio exige que el rol de la sesión y el de la sección sean `PROFESOR`.
- **Base:** `consultarEnUniversidad` como `cursus_app`; la RLS de `nota` (`pol_nota_lectura`) ya deja leer al profesor. No hay políticas nuevas.

El código está en `backend/src/notas/nota-final.ts`, `notas-finales.controller.ts` y `notas-finales.service.ts`. En el frontend, `frontend/src/pages/nota-final.ts`, `MisNotas.tsx` y `NotasFinales.tsx`.

## Verificación

Desde la raíz, con Node 24.15+, dependencias instaladas y PostgreSQL disponible:

```bash
npm run lint
npm run build
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
```

- `backend/src/notas/nota-final.spec.ts`: nota final ponderada; redondeo a un decimal con la mitad hacia arriba (5,05, 4,04, 4,06, 4,333…); parcial sobre el porcentaje evaluado; sin notas, `null`; con todo publicado pero ponderaciones que no suman 100, sigue parcial.
- `backend/test/notas/notas.db-spec.ts` (`nota final (NOT-14)`), en una sección propia con evaluaciones de 30, 30 y 40 %:
  - el profesor ve a cada alumno activo, por nombre: final 5,1 con todo publicado; parcial 7,0 al 30 % con una propuesta que no cuenta; sin nota si no tiene ninguna publicada; la evaluación archivada no cuenta;
  - el alumno ve en `mis-notas` exactamente la misma `notaFinal` que el profesor;
  - una evaluación nueva sin nota vuelve parcial la nota;
  - el ayudante, el alumno, el Administrativo y un profesor que dejó la sección reciben 403; un profesor de otra universidad, 404; sin sesión, 401.
- `backend/test/notas/notas.e2e-spec.ts`: 401 sin sesión, 403 por CASL para el alumno y el Administrativo y sin rutas de escritura en `notas-finales`.
- `frontend/src/pages/MisNotas.test.tsx`: nota parcial con el porcentaje, nota final con un decimal y "Sin notas publicadas".
- `frontend/src/pages/NotasFinales.test.tsx`: la tabla del profesor, el estado vacío, el error con reintento; se vuelve a pedir al leer las notas de una evaluación sin mostrar la carga; el ayudante y el alumno no la ven ni la piden.

## Revisión en local

1. Levantar backend y frontend con las migraciones y el seed.
2. Como profesor, crear evaluaciones que sumen 100 %. Como ayudante, ingresar y enviar las notas de una; como profesor, aprobarlas (NOT-11).
3. Como alumno, abrir el curso → pestaña **Notas**: se ve "Nota parcial X (N % evaluado)".
4. Como profesor, en la misma pestaña, la tabla **Notas finales** muestra el mismo valor para ese alumno.
5. Publicar el resto de las evaluaciones: ambos ven "Nota final X".

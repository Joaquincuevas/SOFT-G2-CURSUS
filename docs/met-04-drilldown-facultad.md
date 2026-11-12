# MET-04: el Director baja de universidad a facultad

Tarjeta: MET-04 (drill-down). Depende de [MET-01](met-01-indicadores-consolidados.md).

**Como** Director, **quiero** abrir una universidad y ver sus facultades con los tres indicadores, **para** ubicar dónde están los resultados.

## Criterios de aceptación

| Criterio                                                                              | Implementación y pruebas                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Al hacer clic en una universidad se muestran sus facultades con los tres indicadores. | En **Indicadores** hay una lista de universidades; cada una enlaza a `/indicadores/universidades/:id`, que muestra una tarjeta por facultad con aprobación, promedio y asistencia.                                   |
| Un breadcrumb permite volver al nivel consolidado.                                    | `Indicadores › Universidad`; el primer tramo vuelve al consolidado.                                                                                                                                                  |
| Se mantiene el período seleccionado al navegar.                                       | El período vive en la URL (`?periodo=AAAA-S`): se pide a la API en ambos niveles y los enlaces lo conservan. Sin él, es el período activo de cada universidad. El selector sigue deshabilitado: el filtro es MET-03. |
| Solo el Director accede.                                                              | CASL `read Metricas` (solo DIRECTOR) en las tres rutas y `consultarEnTodasLasUniversidades`, que responde 403 a los demás roles.                                                                                     |

## Período en los tres niveles

El consolidado de MET-01 también acepta `?periodo=AAAA-S` (`GET /api/metricas/consolidado?periodo=2026-1`): con él, el consolidado, la lista de universidades y las facultades consultan el mismo período; sin él, los tres usan el activo de cada universidad. Con un período que ninguna universidad tiene, el consolidado queda vacío (`periodos: []`, indicadores `null`).

En la interfaz, un `?periodo=` que no tiene la forma `AAAA-S` no se envía a la API: se muestra «El período … no es válido» con un enlace al período activo, distinto de «La universidad no existe».

## API

- `GET /api/metricas/universidades?periodo=AAAA-S`: cada universidad vigente con `periodo`, los tres indicadores, `alumnos` y `cursos`. `periodo` es `null` si la universidad no tiene el período pedido.
- `GET /api/metricas/universidades/:id/facultades?periodo=AAAA-S`: la universidad, su `periodo` y todas sus facultades vigentes (también las sin datos, con indicadores `null`). 404 si la universidad no existe o está archivada; 400 si el id no es UUID o `periodo` no tiene la forma `AAAA-S`.

## Cálculo

No se duplica: la consulta de MET-01 pasó a una base común (`BASE` en `MetricasService`) que deja una fila por nota final y una por registro de asistencia, con su universidad y su facultad (curso → carrera → facultad). El consolidado, las universidades y las facultades solo agrupan esas filas, con las mismas definiciones de MET-01. Un grupo sin denominador da `null`, nunca 0. No hay migración.

## Pruebas

- `backend/test/metricas/metricas.db-spec.ts`: las universidades y las facultades dan los indicadores esperados y suman al consolidado; las facultades de una universidad no se mezclan con las de otra; una facultad sin datos aparece con `null` y una archivada no; el período de la URL filtra; universidad inexistente o archivada 404; id o período inválidos 400; los demás roles 403.
- `backend/test/metricas/metricas.e2e-spec.ts`: 200 Director, 401, 403 los demás roles, 404, 400 y el período llega al servicio.
- `frontend/src/pages/Indicadores.test.tsx`: lista de universidades, facultades con tarjetas y "Sin datos suficientes", breadcrumb, período conservado en la URL, sin facultades, error con reintento, universidad inexistente y otros roles sin acceso.

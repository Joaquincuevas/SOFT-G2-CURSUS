# MET-01: el Director ve los indicadores consolidados

Tarjeta: [MET-01](https://trello.com/c/x3YpxfYj). Depende de NOT-14 (nota final), NOT-11 (notas publicadas), ASI-05 (porcentaje de asistencia) y del acceso del Director a todas las universidades (ADR 0001).

**Como** Director, **quiero** ver la tasa de aprobación, el promedio y la asistencia consolidados de todas las universidades, **para** seguir el período activo sin entrar a cada una.

## Criterios de aceptación

| Criterio                                                                    | Implementación y pruebas                                                                                                                                                                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El dashboard muestra los tres indicadores del período activo, consolidados. | Página **Indicadores** del Director con tres tarjetas (valor, unidad y n). `GET /api/metricas/consolidado` calcula todo en una consulta sobre el período activo de cada universidad.          |
| Se calculan solo con notas publicadas y asistencia registrada.              | La nota final usa solo `nota.estado = 'PUBLICADA'` vigentes; la asistencia solo clases con al menos una marca vigente. Lo prueban los tests de base con notas propuestas y clases sin marcas. |
| Si no hay datos suficientes, se indica en vez de mostrar 0.                 | Un indicador con denominador 0 llega como `null` y la tarjeta dice **Sin datos suficientes**. La API nunca responde 0 por falta de datos.                                                     |

## Definiciones

- **Período activo:** es por universidad (`periodo.activo`, a lo más uno por universidad). Se consolida con el período activo de cada una; la respuesta los lista en `periodos`. Una universidad sin período activo no aporta datos.
- **Alcance:** secciones vigentes de cursos vigentes del período activo de su universidad, e inscripciones vigentes en ellas. Un alumno inscrito en dos secciones cuenta en cada una: la nota final es por sección.
- **Nota final:** la misma regla que NOT-14 (`calcularNotaFinal`), ahora también en SQL como `nota_final(ponderaciones, notas)`: promedio ponderado de las notas publicadas sobre el porcentaje evaluado, en décimas con enteros, redondeado a un decimal con la mitad hacia arriba. NOT-14 distingue `FINAL` (todas las evaluaciones activas con nota publicada y ponderaciones que suman 100) de `PARCIAL`. **Solo cuentan las `FINAL`**: una nota parcial no dice si el alumno aprobó. Al inicio del período, los dos indicadores de notas dicen "Sin datos suficientes".
- **Promedio:** promedio de esas notas finales, con dos decimales. `alumnos` es cuántas notas finales entran.
- **Tasa de aprobación:** notas finales `>= 4,0` dividido por notas finales calculables (`FINAL`), en porcentaje con un decimal.
- **Asistencia:** presentes dividido por registros, con el denominador de ASI-05: por cada inscripción vigente, cada clase vigente de su sección con asistencia registrada (al menos una marca vigente). Sin marca cuenta como ausente, como en `total_clases_asistencia`. Como el resumen de ASI-05, solo cuentan cuentas de alumno vigentes: si se archiva la cuenta de un alumno sin retirar su inscripción, sale de la asistencia. Esa función no sirve al Director (exige la universidad y el rol de la sesión), así que la consulta repite su definición. Porcentaje con dos decimales.
- **Consolidado:** ponderado por alumno. Los numeradores y los denominadores se suman entre universidades antes de dividir; no es un promedio de promedios.
- **Datos insuficientes:** si el denominador es 0, `valor` es `null` y la interfaz muestra "Sin datos suficientes".

## API

`GET /api/metricas/consolidado`, con `@Puede('read', 'Metricas')`: solo el Director (CASL) y, además, `consultarEnTodasLasUniversidades` responde 403 a cualquier otro rol. Responde 200 con `MetricasConsolidadas`:

```json
{
  "periodos": [
    { "universidad": "Universidad Demo Norte", "anio": 2026, "semestre": 2 }
  ],
  "aprobacion": { "valor": 66.7, "aprobados": 2, "evaluados": 3 },
  "promedio": { "valor": 4.57, "alumnos": 3 },
  "asistencia": { "valor": 83.33, "presentes": 5, "registros": 6 },
  "alumnos": 12,
  "cursos": 4
}
```

Desde MET-04 acepta `?periodo=AAAA-S` ([guía](met-04-drilldown-facultad.md)); sin él, el período activo de cada universidad. Todo el cálculo está en una consulta (`MetricasService`), en la transacción READ ONLY del Director con la RLS de `DIRECTOR`, que lee todas las universidades.

## Base de datos

Migración `CalcularNotaFinal1792930000000`: función SQL `nota_final(ponderaciones integer[], notas numeric[])`, `IMMUTABLE`, que devuelve `(tipo, nota, porcentaje_evaluado)` con la aritmética de `calcularNotaFinal`. Es pura (recibe las ponderaciones y notas publicadas de las evaluaciones activas de una sección) para que MET-02 a MET-08 la reutilicen. NOT-14 sigue con la función de TypeScript; el test de base comprueba que coinciden con los mismos datos. Sin tablas ni políticas nuevas.

## Interfaz

Menú del Director: **Indicadores** (`/indicadores`, permiso `read Metricas`). Muestra:

- un selector **Período** deshabilitado con el período activo (el filtro es MET-03);
- tres tarjetas: **Tasa de aprobación** (%, "a de b alumnos con nota final"), **Promedio** ("n alumnos con nota final") y **Asistencia** (%, "p presentes de r registros");
- cuántos alumnos y cursos entran;
- estados de carga, error con **Reintentar** y "Sin datos suficientes" por tarjeta.

## Pruebas

- `backend/test/metricas/metricas.db-spec.ts`: los indicadores coinciden con NOT-14 (`calcularNotaFinal`) y ASI-05 para los mismos datos; las notas propuestas, las inscripciones archivadas, las evaluaciones archivadas y las clases sin marcas no cuentan; una nota `PARCIAL` no cuenta; dos universidades se consolidan ponderado por alumno; sin datos, `null`; los otros roles reciben 403; `nota_final` da lo mismo que `calcularNotaFinal` en los casos límite.
- `backend/test/metricas/metricas.e2e-spec.ts`: 401, 200 para el Director y 403 para los demás roles.
- `frontend/src/pages/Indicadores.test.tsx`: tarjetas, "Sin datos suficientes", error con reintento y el menú de los otros roles.

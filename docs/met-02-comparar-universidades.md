# MET-02: el Director compara los indicadores entre universidades

Tarjeta: MET-02. Depende de [MET-01](met-01-indicadores-consolidados.md). Reutiliza la consulta de universidades de [MET-04](met-04-drilldown-facultad.md).

**Como** Director, **quiero** comparar los indicadores entre universidades, **para** detectar diferencias de rendimiento.

## Criterios de aceptación

| Criterio                                                                              | Implementación y pruebas                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Se muestran los tres indicadores de cada universidad lado a lado, en tabla y gráfico. | En **Indicadores** hay un enlace «Comparar universidades» que abre `/indicadores/comparar`. La tabla tiene una fila por universidad con su período, tasa de aprobación, promedio, asistencia y alumnos. Debajo, un gráfico de barras horizontales con una barra por universidad. Un indicador sin denominador dice «Sin datos suficientes» en la tabla y en el gráfico, sin barra, nunca 0. |
| Se puede elegir qué indicador se grafica.                                             | Selector «Indicador a graficar» (tasa de aprobación por defecto, promedio o asistencia). Los porcentajes se dibujan sobre 100 y el promedio sobre la escala de notas 1,0 a 7,0.                                                                                                                                                                                                             |
| Solo el Director accede a esta comparación.                                           | La vista vive bajo `/indicadores`, que solo aparece y se abre con `read Metricas` (solo DIRECTOR). Los datos vienen de `GET /api/metricas/universidades`, que ya responde 403 a los demás roles (MET-04).                                                                                                                                                                                   |

## Período

Igual que en MET-03 y MET-04, el período vive en la URL (`?periodo=AAAA-S`). El enlace desde el consolidado y el breadcrumb `Indicadores › Comparar universidades` lo conservan, y el selector de período también está en la comparación. Con la opción por defecto, cada universidad muestra su período activo, que aparece en la columna **Período**; una universidad sin el período pedido muestra «Sin período». Un `?periodo=` inválido se avisa sin consultar la API.

## API

No hay cambios en el backend ni migración: la comparación usa `GET /api/metricas/universidades?periodo=AAAA-S` de MET-04, que ya entrega los tres indicadores, `alumnos` y `cursos` de cada universidad vigente, calculados sobre la base común de MET-01.

## Pruebas

- `frontend/src/pages/Indicadores.test.tsx` (bloque MET-02): tabla con las columnas y los valores de cada universidad, «Sin datos suficientes» y «Sin período»; gráfico con aprobación por defecto, cambio a promedio y asistencia, y largo de cada barra; enlace desde el consolidado y breadcrumb con el período; cambio de período; período inválido sin consulta; error con reintento; sin universidades; y profesor, alumno y administrativo sin acceso por la URL.

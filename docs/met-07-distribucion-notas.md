# MET-07: el Director ve la distribución de notas de un curso

Tarjeta: MET-07. Depende de [MET-06](met-06-drilldown-curso.md).

**Como** Director, **quiero** ver la distribución de notas finales de un curso, **para** revisar cuántos alumnos están en cada rango y dónde está la aprobación.

## Criterios de aceptación

| Criterio   | Implementación                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Histograma | `GET /api/metricas/cursos/:id/distribucion` devuelve seis rangos y el frontend los muestra como barras y tabla equivalente. |
| Aprobación | La línea se marca en 4,0, valor compartido por backend y frontend mediante `NOTA_MINIMA_APROBACION`.                        |
| Acceso     | CASL `read Metricas`, exclusivo del Director; un curso archivado sigue siendo consultable.                                  |

## Rangos y bordes

La distribución usa las mismas notas `FINAL` que `BASE` y que los indicadores de MET-06. La función `nota_final()` redondea a una décima antes de agrupar. Los intervalos son `[1,0, 2,0)`, `[2,0, 3,0)`, `[3,0, 4,0)`, `[4,0, 5,0)`, `[5,0, 6,0)` y `[6,0, 7,0]`. Por eso 1,9 queda en 1,0–1,9; 2,0 inicia el segundo rango; 3,9 queda en 3,0–3,9; 4,0 inicia el rango aprobado; 5,9 queda en 5,0–5,9; y 6,0 y 7,0 quedan en 6,0–7,0.

## API e interfaz

El curso fija su propio período: el endpoint no acepta `?periodo=` y responde 400 si se envía. La respuesta contiene universidad, facultad, carrera, curso, `totalEvaluados`, `notaMinimaAprobacion` y seis rangos. Sin notas finales, todos los conteos son cero. El breadcrumb `Indicadores › Universidad › Facultad › Carrera › Curso` conserva el período de navegación.

El histograma usa clases propias (`indicadores__histograma-*`) para no compartir estilos con la comparación de MET-02, y sus seis columnas se encogen y rotulan en dos líneas, así que cabe desde 320 px sin desbordarse; la línea de aprobación queda entre la tercera y la cuarta columna. El histograma tiene nombre accesible y una tabla equivalente para lectores de pantalla y para no depender del color. La pantalla incluye estados de carga, vacío, error con reintento y curso inexistente.

No hay migración. Las pruebas cubren bordes, suma de rangos, curso sin notas, archivado, permisos, errores HTTP y la presentación accesible.

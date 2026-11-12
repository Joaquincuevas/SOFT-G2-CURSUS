# MET-06: el Director baja de carrera a curso

Tarjeta: MET-06. Depende de [MET-05](met-05-drilldown-carrera.md).

**Como** Director, **quiero** abrir una carrera y ver sus cursos con los tres indicadores, **para** revisar el desempeño académico a nivel de curso.

## Criterios de aceptación

| Criterio              | Implementación                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Indicadores por curso | `GET /api/metricas/carreras/:id/cursos` calcula aprobación, promedio y asistencia reutilizando `BASE`.                  |
| Ordenamiento          | La interfaz ordena por aprobación, promedio o asistencia, ascendente o descendente; los valores `null` quedan al final. |
| Breadcrumb            | `Indicadores › Universidad › Facultad › Carrera`, con enlaces que conservan el período.                                 |
| Acceso                | CASL `read Metricas`, exclusivo del Director.                                                                           |

## API y alcance

`GET /api/metricas/carreras/:id/cursos?periodo=2026-2` responde la universidad, la facultad, la carrera, el período y todos los cursos de la carrera en ese período. Cada curso contiene `id`, `codigo`, `nombre` y los tres indicadores. Un curso sin denominador tiene indicadores con `valor: null`, nunca cero. La universidad sale de la carrera, no de la sesión del Director: puede abrir carreras de cualquier universidad. La carrera debe existir y estar vigente; un id inválido responde 400 y una carrera inexistente o archivada responde 404.

La dimensión de cursos sale de `curso` y los indicadores de las filas de notas finales y asistencia de `BASE`. No se excluyen cursos archivados: así los períodos cerrados siguen siendo consultables. No hay migración.

## Interfaz y pruebas

Cada carrera de MET-05 enlaza a la tabla de cursos. Los encabezados son botones accesibles y exponen `aria-sort`; el campo `orden` y su `direccion` quedan en la URL junto con `periodo`. Cambiar el período conserva `orden` y `direccion`, para comparar semestres sin volver a ordenar; el breadcrumb usa la universidad y la facultad que devuelve la API, con las de la URL como respaldo mientras carga. La pantalla muestra estados de carga, vacío, error con reintento y carrera inexistente. Solo el Director puede acceder.

Las pruebas de base cubren indicadores, aislamiento por carrera, cursos sin datos, períodos y cursos archivados; las e2e cubren permisos, sesión, 404, UUID inválido y período; las frontend cubren navegación, breadcrumb, ordenamiento, estados y roles.

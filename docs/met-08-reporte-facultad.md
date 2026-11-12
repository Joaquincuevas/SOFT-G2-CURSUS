# MET-08: el Administrativo genera el reporte académico de su facultad

**Como** Administrativo, **quiero** consultar los indicadores de las carreras y cursos de mi facultad, **para** revisar su desempeño académico por período.

## Criterios de aceptación

| Criterio                             | Implementación                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Tres indicadores por carrera y curso | `GET /api/metricas/facultad` agrupa aprobación, promedio de notas finales y asistencia.              |
| Solo mi facultad                     | El alcance se obtiene de `facultad_actual(usuario_actual())`; el cliente no envía un id de facultad. |
| Filtro por período                   | `?periodo=AAAA-S`; sin query usa el período activo de la universidad.                                |
| Acceso                               | CASL usa `read ReporteMetricasFacultad`, exclusivo del Administrativo.                               |

## API

`GET /api/metricas/facultad?periodo=2026-2` responde `ReporteFacultad` con la facultad, el período y carreras. Cada carrera contiene sus cursos y los tres indicadores. Si no hay denominador, `valor` es `null` y la interfaz muestra **Sin datos suficientes**. Los cursos archivados de períodos cerrados siguen incluidos.

El listado sale de los cursos del período y la facultad de la sesión, tengan o no secciones: un curso recién creado aparece con sus indicadores en `null`, y su carrera también. El promedio de una carrera suma las notas finales con su precisión original, divide por el total de evaluados y redondea una sola vez a dos decimales; no pondera promedios de curso ya redondeados.

La consulta reutiliza la base de MET-01/MET-04: las filas de notas finales y registros de asistencia se agrupan por curso y luego por carrera. La RLS de `nota` solo deja leer a profesores, ayudantes y Director, así que el reporte corre en `BaseDeDatos.consultarFacultadDelAdministrativo`: una transacción READ ONLY que lee con el rol DIRECTOR, solo para esta consulta y solo si la sesión es de un Administrativo (403 en otro caso). Como la RLS ya no acota la lectura, el alcance lo fija la propia consulta: filtra por la universidad de la sesión y por `facultad_actual(usuario_actual())`, nunca por un dato del cliente. No hay migración.

## Interfaz y pruebas

El menú **Reporte académico** aparece solo al Administrativo. La página conserva el período en la URL, muestra estados de carga, vacío y error con reintento, y presenta una tabla accesible de carreras y cursos.

Las pruebas de base cubren el aislamiento de facultad y universidad (cada administrativo ve solo la suya), valores por carrera y curso, datos insuficientes, períodos y cursos archivados. Las pruebas e2e cubren permisos, sesión y período inválido; las frontend cubren tabla, filtro, estados y navegación por rol.

# MET-05: el Director baja de facultad a carrera

Tarjeta: MET-05. Depende de [MET-04](met-04-drilldown-facultad.md).

**Como** Director, **quiero** abrir una facultad y ver sus carreras con los tres indicadores, **para** ubicar el desempeño académico dentro de la universidad.

## Criterios de aceptación

| Criterio                | Implementación                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Indicadores por carrera | `GET /api/metricas/facultades/:id/carreras` calcula aprobación, promedio y asistencia reutilizando `BASE`.   |
| Breadcrumb              | `Indicadores › Universidad › Facultad`, con enlaces a los niveles anteriores.                                |
| Período                 | `?periodo=AAAA-S` se conserva en las rutas y peticiones; sin él se usa el comportamiento del período activo. |
| Acceso                  | CASL `read Metricas` y lectura global de métricas, exclusivo del Director.                                   |

## API y alcance

`GET /api/metricas/facultades/:id/carreras?periodo=2026-2` responde la universidad, la facultad, el período y todas las carreras vigentes de esa facultad. La universidad sale de la facultad, no de la sesión del Director: puede abrir facultades de cualquier universidad. Una carrera sin datos tiene indicadores `null`, nunca cero; una carrera archivada no aparece. El id debe ser UUID; una facultad inexistente o archivada responde 404.

La consulta agrega por `carrera_id` las filas de notas finales y registros de asistencia que ya construye la consulta base de MET-01/MET-04. Los cursos archivados permanecen en el cálculo para períodos cerrados. No se agrega una migración.

## Interfaz y pruebas

Cada facultad de la vista de universidades enlaza a sus carreras. La vista muestra tarjetas con los tres indicadores, estados de carga, vacío y error con reintento, y conserva el período en el breadcrumb. Solo el Director puede acceder; los demás roles no reciben la vista ni sus peticiones.

Las pruebas de base cubren indicadores, carreras sin datos, aislamiento entre facultades, período, cursos archivados, 404, UUID inválido y permisos. Las e2e cubren 200, 401, 403, 404, 400 y el período; frontend cubre navegación, breadcrumb, estados y roles.

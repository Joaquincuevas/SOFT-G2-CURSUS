# docs

Documentación del proyecto:

- ESP-05: `GET /api/espacio/secciones/:id/alumnos` devuelve `AlumnosEspacio` (`total` y `alumnos` con id, nombre y correo, por nombre) con las inscripciones activas de la sección, solo a su profesor y en solo lectura; a los demás integrantes (ayudante, alumno), al Administrativo y al Director, 403. Reutiliza la consulta de GES-18 (`backend/src/gestion/alumnos.sql.ts`).

- ESP-04: `GET /api/espacio/secciones/:id/resumen` devuelve `SeccionResumen` (curso, sección, horario con sala, profesor, ayudantes activos y el rol del usuario) a los integrantes de la sección, al Administrativo de su facultad y al Director; al resto, 403 (guard de ESP-06).

- ESP-02: `GET /api/dashboard/secciones-ayudante` devuelve las secciones del período activo donde el usuario es ayudante (`SeccionAyudante[]`), con curso, número y profesor a cargo; para otro rol, `[]`.

- [ESP-01: el profesor ve sus secciones del período en su dashboard](esp-01-dashboard-profesor.md)

- [ESP-06: solo los integrantes de una sección acceden a ella](esp-06-acceso-seccion.md)

- [GES-20: seed de una facultad completa y guía de revisión](ges-20-seed-facultad.md)

- [GES-11: aviso de sala ocupada y guía de revisión](ges-11-sala-ocupada.md)

- [GES-10: horarios de secciones y guía de revisión](ges-10-horarios-seccion.md)

- [GES-16: carga de alumnos desde CSV y guía de revisión](ges-16-carga-alumnos-csv.md)

- [GES-13: asignar ayudantes a una sección](ges-13-asignar-ayudantes.md)

- [GES-01: carreras por facultad y guía de revisión](ges-01-carreras-facultad.md)
- [GES-02: períodos académicos y guía de revisión](ges-02-periodos-academicos.md)
- [GES-06: código de curso único por período y guía de revisión](ges-06-codigo-curso-unico.md)
- [GES-07: edición de cursos con historial y guía de revisión](ges-07-editar-curso.md)
- [GES-12: asignar el profesor de una sección y guía de revisión](ges-12-asignar-profesor.md)
- [GES-14: quitar al profesor o a un ayudante de una sección y guía de revisión](ges-14-quitar-asignacion.md)

- [AUTH-02: credenciales inválidas y guía de revisión](auth-02-credenciales-invalidas.md)
- [AUTH-03: cierre de sesión y guía de revisión](auth-03-cierre-sesion.md)
- [AUTH-07: límite de login y guía de revisión](auth-07-rate-limiting-login.md)

- `informes/`: entregas e informes del curso
- `c4/`: diagramas C4 (contexto, contenedores, componentes)
- `adr/`: Architecture Decision Records (`NNNN-titulo.md`)
  - [0001: acceso del Director entre universidades](adr/0001-acceso-del-director-entre-universidades.md)

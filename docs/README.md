# docs

Documentación del proyecto:

- [ANU-04: anuncios nuevos del alumno, contador y guía de revisión](anu-04-anuncios-nuevos.md)
- [MAT-08: actividades de entrega con plazo y guía de revisión](mat-08-actividades-entrega.md)
- [ANU-03: lectura de anuncios del alumno por fecha y guía de revisión](anu-03-lectura-anuncios-alumno.md)
- [ANU-02: anuncios dirigidos a una sección y guía de revisión](anu-02-anuncios-seccion.md)
- [ASI-02: marcar presente o ausente a cada alumno de una clase y guía de revisión](asi-02-marcar-asistencia.md)
- [NOT-04: auditoría de las notas (tabla `nota_cambio`, solo adición) y guía de revisión](not-04-auditoria-notas.md)

- ASI-01: `GET /api/espacio/secciones/:id/clases` devuelve `Clase[]` (clases activas de la sección por fecha y bloque, con fecha, inicio, término y sala) al profesor y a los ayudantes de la sección y al Director (solo lectura); al alumno (ve su asistencia en ASI-06), al Administrativo y a quien no es integrante, 403. `POST` con `{ fecha?, inicio }` registra una clase y responde 201: solo el profesor de la sección (al resto, 403). Sin fecha, el backend usa hoy en America/Santiago; la fecha debe estar dentro del período del curso, e `inicio` debe ser un bloque activo del horario (GES-10) en ese día de la semana: la clase copia ese bloque (inicio, término y sala). Sin bloque ese día, o sin horario, 400; misma sección, fecha y bloque, 409. Sin DELETE: se archiva (`archived_at`).
- NOT-01: `GET /api/espacio/secciones/:id/evaluaciones` devuelve `EvaluacionesSeccion` (evaluaciones activas de la sección por fecha, con nombre, fecha y ponderación entera, y `sumaPonderaciones`) al profesor, a los ayudantes y alumnos de la sección y al Director (solo lectura); al Administrativo y a quien no es integrante, 403. `POST` con `{ nombre, fecha, ponderacion }` crea una evaluación y responde 201: solo el profesor de la sección (al resto, 403); ponderación entera de 1 a 100 (DTO y CHECK) y fecha dentro del período del curso (si no, 400). La evaluación es de la sección, no del curso. Sin DELETE: se archiva (`archived_at`).
- [ANU-01: anuncios para todo el curso y guía de revisión](anu-01-anuncios-curso.md)

- [ESP-03: cursos del alumno en el dashboard y guía de revisión](esp-03-dashboard-alumno.md)

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

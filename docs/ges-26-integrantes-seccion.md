# GES-26: vista única de integrantes de una sección

Tarjeta: [F4 · GES-26](https://trello.com/c/Q36KzO7a/189-f4-ges-26-vista-%C3%BAnica-para-agregar-integrantes-a-una-secci%C3%B3n). Referencia: feedback de la demo del 27-10-2026. Depende de GES-25, integrada en `develop`.

**Como** administrativo, **quiero** agregar profesores, ayudantes y alumnos desde una misma vista, **para** gestionar los integrantes de una sección con un solo flujo.

## Criterios de aceptación

| Criterio                                                                              | Implementación                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Todos los accesos de gestión del detalle del curso llevan a Integrantes.              | Cada sección tiene un enlace **Integrantes**. El número de alumnos abre la misma vista en **Alumnos**. Los enlaces antiguos `/secciones/:id/alumnos` del administrativo redirigen allí.                                  |
| Profesores, ayudantes y alumnos usan el mismo flujo para agregar y quitar con motivo. | Seleccionar rol → buscar por correo/nombre → **Agregar**. En la lista, **Quitar** abre la misma confirmación con motivo obligatorio para cualquiera de los tres roles.                                                   |
| Alumnos mantiene la carga CSV y su reporte de errores.                                | En **Alumnos** se reutiliza `CargarAlumnosCsvDialogo`: plantilla, carga parcial, contraseñas provisorias y descarga de errores conservan su comportamiento.                                                              |
| Se mantienen las validaciones y el historial.                                         | La API común delega en los servicios de GES-25, GES-13, GES-14, GES-15 y GES-19. Se conserva `asignacion_cambio` para profesores/ayudantes y la inscripción archivada con responsable para alumnos, agregando su motivo. |

## Uso

En **Mis Cursos → detalle del curso → sección → Integrantes**:

1. Elegir **Profesores**, **Ayudantes** o **Alumnos**. Cada botón muestra su cantidad vigente.
2. Buscar por correo o nombre, con al menos dos caracteres. Se muestran hasta 20 coincidencias; si hay más, se invita a acotar la búsqueda.
3. Presionar **Agregar** en la persona elegida. Solo se ofrecen cuentas activas de ese rol y universidad que todavía no estén asignadas.
4. Para retirar, presionar **Quitar**, revisar nombre/correo/sección, escribir el motivo y confirmar. Se conserva la cuenta y el registro del retiro. Cancelar no escribe nada.

Durante una modificación se bloquean los controles y el cambio de rol; la confirmación de retiro no se puede cerrar con Escape mientras se guarda. Los errores permiten reintentar; un 404/409 al modificar obliga a refrescar los datos. Cambiar de rol o búsqueda descarta los resultados de la consulta anterior para no agregar desde una respuesta obsoleta.

La búsqueda respeta los permisos existentes: se gestiona solo una sección de la facultad del administrativo, pero puede agregar cuentas de toda su universidad. No se ofrecen cuentas archivadas, personas de otra universidad ni personas de otro rol. Los caracteres `%`, `_` y `\` se buscan literalmente, sin convertirse en comodines.

### Cuentas nuevas y CSV

En **Alumnos**, **Crear alumno e inscribir** conserva el flujo de GES-15: correo institucional, nombre solo cuando la cuenta no existe y contraseña provisoria visible una sola vez. Se sigue exigiendo el cambio de contraseña en el primer ingreso. El formulario no se cierra durante la creación.

**Cargar CSV** conserva GES-16/17 y vuelve a pedir el listado al terminar, sin desmontar el resultado ni perder las contraseñas provisorias. Los errores se descargan con las protecciones existentes contra fórmulas. El horario del curso permanece al volver desde Integrantes.

Las cuentas de profesores y ayudantes se siguen creando en **Profesores y ayudantes**; Integrantes permite buscarlas y asignarlas. No crea cuentas docentes por otro camino.

El Director conserva el listado de alumnos de su universidad en solo lectura y los nombres del equipo en el detalle del curso. No puede abrir la gestión de Integrantes. Profesor, ayudante y alumno tampoco reciben acceso a ella.

## API

Todas las rutas nuevas exigen sesión y `update Seccion`. El servicio vuelve a exigir el contexto Administrativo y una sección activa de su facultad; el superadmin trabaja como Administrativo en la facultad elegida, como antes.

| Método | Ruta                                               | Cuerpo/filtro                                               | Resultado                                                                                           |
| ------ | -------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| GET    | `/api/secciones/:id/integrantes`                   | —                                                           | `IntegrantesSeccion`: contexto de sección/curso e integrantes activos con id, nombre, correo y rol. |
| GET    | `/api/secciones/:id/integrantes/buscar`            | `rol=PROFESOR\|AYUDANTE\|ALUMNO`, `q` de 2 a 150 caracteres | `BusquedaIntegrantes`: `personas` e indicador `hayMas`.                                             |
| POST   | `/api/secciones/:id/integrantes`                   | `{ rol, usuarioId }`                                        | 204 al confirmar el alta.                                                                           |
| PATCH  | `/api/secciones/:id/integrantes/:usuarioId/quitar` | `{ rol, motivo }`                                           | 204 al confirmar el retiro.                                                                         |

El motivo se guarda sin espacios extremos y admite de 1 a 500 caracteres. Se rechazan campos extra, roles fuera de la lista y UUID inválidos. La identidad del responsable sale de la sesión.

- **401:** sin sesión.
- **403:** otro rol sin permiso de gestión.
- **404:** sección inexistente, archivada, de otra universidad/facultad o persona no disponible para la operación.
- **400/409:** selección inválida, cuenta archivada, rol distinto, asignación duplicada o motivo inválido, según las validaciones existentes.

Las rutas anteriores de profesores, ayudantes, inscripción y CSV se mantienen. El alta por id del alumno verifica que la cuenta corresponda a la elegida, aun si su correo cambia entre la búsqueda y el alta; no inscribe otra cuenta ni crea una accidentalmente.

El cliente vuelve a consultar después de cada cambio. Los retiros y las validaciones transaccionales siguen a cargo de los servicios existentes, incluidos sus locks y sus restricciones de universidad/facultad. Las lecturas del buscador y del listado repiten el alcance de facultad en su propia consulta.

## Datos e historial

Migración `1792850000000-MotivoRetiroAlumno`, posterior a MAT-09:

- agrega `inscripcion.motivo_retiro`, nullable;
- si tiene valor, exige inscripción archivada, texto sin espacios extremos y longitud de 1 a 500 caracteres;
- conserva las inscripciones históricas y sus fechas/responsables; un registro antiguo sin motivo sigue siendo válido;
- no cambia tablas, permisos ni historial de asignaciones de profesores/ayudantes.

El retiro nuevo de alumnos guarda motivo, fecha y responsable en la misma transacción. Reinscribir crea otra inscripción y conserva la anterior. El endpoint legado sin motivo permanece compatible con los clientes anteriores y guarda `NULL`; la API nueva de Integrantes siempre exige motivo. El motivo también se fija para la auditoría del superadmin.

La migración es aditiva y compatible con el backend anterior. `down()` elimina la columna y su CHECK; conserva inscripciones, fechas y responsables, aunque elimina los motivos nuevos. La prueba de migraciones valida aplicación y reversión en el orden definitivo.

La nueva pantalla requiere la API de GES-26. Se retiraron los tres diálogos de gestión separados y sus pruebas se sustituyeron por pruebas del flujo compartido. La creación de alumnos y el CSV se reutilizan. El detalle del curso sigue leyendo el profesor deprecado cuando una respuesta anterior no trae `profesores`.

## Verificación

Con Node 24.15+ y PostgreSQL local:

```sh
npm run lint
npm run format:check
npm run build
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
```

- `integrantes.db-spec.ts`: búsqueda, altas y bajas de los tres roles, motivo/historial, reincorporación, búsqueda literal y acotada, cuentas archivadas/ajenas, otros roles, aislamiento por facultad/universidad y compatibilidad con el retiro anterior y CSV parcial.
- `integrantes.e2e-spec.ts`: sesión, filtros, UUID, roles, campos extra y motivo obligatorio.
- `IntegrantesSeccion.test.tsx`: acceso desde curso, buscador y retiro comunes, bloqueo, Cancelar/Escape, error/reintento, respuestas obsoletas y creación de alumno con contraseña provisoria.
- `CargarAlumnosCsv.test.tsx`: se conserva la cobertura del reporte y su descarga desde la nueva vista.
- `EditarHorario.test.tsx`: el recorrido de CSV por Integrantes conserva horario y conteo al volver al curso.
- `AlumnosSeccion.test.tsx`: redirección de enlaces anteriores y lectura del Director.

Se verificó también contra la API compilada y PostgreSQL en una base aislada: buscar/agregar/retirar en los tres roles, persistencia de los motivos e historial, CSV con una fila válida y otra inválida, creación de una cuenta nueva y rechazo de otro administrativo de facultad.

La comprobación visual y las capturas quedaron pendientes: el host de acceso al navegador y el control nativo de Chrome no respondieron. No se presentan capturas simuladas como evidencia de uso real.

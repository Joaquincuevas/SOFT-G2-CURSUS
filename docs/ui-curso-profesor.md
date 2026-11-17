# Entorno de curso del profesor: pulido estilo Canvas

Fix sobre UI/UX-05 y UI/UX-06 (ya mergeadas), sin tarjeta propia. Deja el entorno de curso del profesor a todo el ancho, con la navegación del curso a la izquierda, la acción principal de cada pestaña arriba a la derecha y listas como tablas de filas finas. No cambia backend, seed, `@cursus/shared`, permisos CASL ni `navigation.ts`.

## Hallazgos

Recorrido con el seed como profesor (`matias.munoz@norte.cursus.test`, ICC101 sección 2, período 2026-2) en Home, Anuncios, Material, Entregas, Notas, Asistencia e Integrantes, a 1280 y 1920 px (y 375 px). Capturas en [`evidencias/`](evidencias/) como `ui-curso-profesor-antes-<pestaña>-<ancho>.png`.

**Layout**

1. El entorno de curso estaba en un contenedor centrado de 1152 px (`max-w-6xl`): a 1920 px quedaban 444 px sin usar.
2. La cabecera ocupaba tres líneas (chips, nombre y «Entras como Profesor» aparte).
3. El ítem activo de la navegación del curso llevaba fondo de color y, con el teclado, el borde de foco grueso del componente base (anillo de 3 px más contorno).

**Material y sílabo**

4. El sílabo aparecía dos veces: la tarjeta «Sílabo del curso» arriba y la sección «Versiones del sílabo» abajo, con su propio formulario y su propio estado vacío.
5. Los formularios de subir material y de publicar el sílabo estaban fijos en la página, con el selector de archivo «Seleccionar archivo / Ningún archivo seleccionado».
6. Las confirmaciones («Material subido», «Sílabo publicado.») eran texto verde suelto.
7. Cada material era una tarjeta; la versión nueva y el historial iban dentro de cada tarjeta.
8. El estado vacío decía «Usa el formulario…» sin un botón.

**Anuncios**

9. Formulario fijo arriba, con un `<select>` nativo.
10. «Aún no hay anuncios» como texto suelto.
11. Editar y el historial se abrían dentro de la tarjeta.
12. Las tarjetas podían salirse del ancho con un título o mensaje largo sin espacios: faltaban `min-width: 0` y el corte de palabras.

**Entregas**

13. Formulario fijo con `<input type="date">` y `<input type="time">` nativos («dd-mm-yyyy», «--:-- --» y AM/PM según el navegador) y sin validar el período antes de enviar.
14. Los errores del servidor mostraban fechas en ISO («del 2026-08-03 al 2026-12-18»).
15. Las actividades eran tarjetas, con la tabla de entregas de cada una debajo.

**Notas, Asistencia, Integrantes y Home**

16. Notas: la tabla de notas finales tenía el borde oscuro (clase `border` sin color). El formulario de evaluaciones sigue en la página, con `<input type="date">` nativo.
17. Asistencia: fecha con `<input type="date">` nativo, `<select>` nativos («Elige un bloque», «Ordenar por porcentaje» a todo el ancho), botón «Registrar clase» gris cuando falta el bloque y estilos propios (`PestanaAsistencia.css`).
18. Integrantes: el equipo docente sin tarjeta y la lista de alumnos en una tarjeta de borde oscuro.
19. Home: la tarjeta del sílabo con estilos propios (`vista-seccion__silabo`).

**Consola y entorno**

20. Sin avisos de React; solo el 401 del refresco de sesión.
21. En local, el backend respondía 503 al subir archivos porque no tenía configurado S3; se levantó con LocalStack (`S3_*` del `.env.example`) para probar las subidas.

## Qué cambia

### 1. Layout a todo el ancho

- Sin contenedor angosto: el contenido usa todo el ancho, con la navegación del curso fija a la izquierda (220 px) desde 1024 px.
- Cabecera compacta: chips de código, sección y período con «Entras como Profesor» en la misma línea, y el nombre del curso debajo.
- Navegación: el ítem activo se marca con texto en negrita y una barra fina del color de la universidad, sin fondo; el foco es un anillo fino. En pantallas angostas pasa a una barra horizontal con desplazamiento.

### 2. Material y sílabo

- **`Dropzone`** (`components/shared/Dropzone.tsx`): «Arrastra un archivo aquí o haz clic para seleccionar». Muestra nombre, tamaño y botón para quitar, rechaza el tipo o el tamaño con el motivo junto al campo (`aria-invalid` y `aria-describedby`) y se maneja con el teclado (el control es el input nativo). Reemplaza el selector de archivo del profesor en Material y el sílabo.
- **Sílabo:** una sola tarjeta con la versión vigente, «Descargar» y «Subir nueva versión» (Dialog con el Dropzone, PDF hasta 10 MiB). El historial de versiones anteriores se pliega debajo. Confirma con un aviso breve (sonner).
- **Material:** «Subir material» arriba a la derecha abre un Dialog: Dropzone (20 MB y los tipos permitidos), título que se completa con el nombre del archivo, categoría (`NativeSelect`) y descripción opcional. Debajo, una tabla por categoría con ícono por tipo, título, categoría, tamaño, fecha y acciones: «Descargar» y un menú con «Subir nueva versión» e «Historial de versiones», cada uno en su Dialog. Editar o eliminar un material no existen en la API, así que no se ofrecen. Estado vacío con la acción.
- Se mantienen la subida en tres pasos (pedir, subir a S3, confirmar), el reintento sin volver a subir y los límites.

### 3. Anuncios

- «Nuevo anuncio» arriba a la derecha abre un Dialog con Dirigido a, Título, Mensaje y el texto de alcance. Sin formulario fijo en la página.
- Tarjetas con el autor (avatar de iniciales), la fecha, la audiencia como insignia, el título y el mensaje recortado a tres líneas con «Ver más». «Editar anuncio» y «Ver historial» son botones fantasma a la derecha y abren su Dialog.
- Las tarjetas ya no se salen del ancho (`min-w-0` y corte de palabras).

### 4. Entregas y fechas

**Regla del backend** (`backend/src/materiales/actividades.service.ts`): la actividad se crea solo si `fecha` está entre `fecha_inicio` y `fecha_termino` del período del curso y si `(fecha + hora) AT TIME ZONE 'America/Santiago' > now()`. Si no, responde 400 con «La fecha límite debe estar dentro del período del curso (del AAAA-MM-DD al AAAA-MM-DD)» o «La fecha y hora límite deben ser posteriores a la hora actual».

**Réplica en el cliente** (`pages/ventanaActividad.ts`, sin cambiar el backend):

- Ventana válida de días = [max(hoy, inicio del período), fin del período], con hoy en America/Santiago. Las fechas del período salen de `GET /api/periodos` (el resumen de la sección solo trae año y semestre).
- El calendario (Popover + Calendar en español, semana desde el lunes) deshabilita los días fuera de la ventana.
- Hora límite de 24 horas en dos `NativeSelect` (hora y minutos de 5 en 5), sin AM/PM. Si el día es hoy, las horas y minutos que ya pasaron no se pueden elegir.
- Un error por campo con `aria-describedby`; si la fecha no sirve, no se opina de la hora. Los errores del servidor van en una alerta de peligro y sus fechas se muestran en dd-mm-aaaa.
- Si la ventana está vacía (el período terminó), una sola alerta de advertencia arriba: «El período 2026-1 terminó el 30-06-2026. No se pueden crear actividades nuevas en este curso.», y «Crear actividad» queda deshabilitado.
- Las actividades son una tabla con título, fecha límite, estado y «Ver entregas», que abre las entregas de los alumnos en un Dialog. Estado vacío con «Crear actividad».

### 5. Notas, Asistencia, Integrantes y Home

- Integrantes: el equipo docente en una tarjeta y los alumnos en una tabla (nombre y correo).
- Home: la tarjeta del sílabo con los mismos componentes que el resto.
- Notas: la tabla de notas finales con el borde fino.
- `VistaSeccion.css` queda solo con el subtítulo que siguen usando Asistencia y las vistas del alumno; `PestanaAnuncios.css` se borra; `PestanaEntregas.css` queda solo con lo que usan las actividades del alumno y su entrega.

## Pendiente (anotado, no se cambió)

- **Notas:** el formulario para crear evaluaciones sigue fijo en la página, con `<input type="date">` nativo. Pasarlo a un Dialog con el mismo DatePicker es el siguiente paso.
- **Asistencia:** sigue con sus estilos propios, la fecha nativa y los `<select>` nativos; conviene migrarla completa (es la pestaña con más lógica).
- **`FileInput`** (UI/UX-03) ya no lo usa ninguna pantalla del profesor; queda en `components/shared` para otras (por ejemplo, la carga de alumnos por CSV aún usa el input nativo).
- **Vistas del alumno** que comparten archivo (actividades y entrega, versiones del sílabo) no se tocaron.

## Pregunta: el período del seed

En el seed del equipo el período 2026-1 terminó el 30-06-2026. Con la regla actual, en un curso de ese período ninguna fecha es válida y no se puede crear ninguna actividad (la pantalla ahora lo dice y deshabilita el botón). ¿Qué prefieren?

1. Que el seed cree un período vigente con fechas relativas al día en que se carga.
2. Que el backend permita plazos posteriores al fin del período (por ejemplo, para recuperativos).
3. Mantener la regla y usar un curso del período vigente para probar.

No se implementó ninguna. (En la base local de este recorrido el curso es del período 2026-2, vigente hasta el 18-12-2026; el caso del período terminado se capturó simulando la respuesta de `/api/periodos`.)

## Mis cursos (`/mis-cursos`)

Fix sobre UI/UX-05 y UI/UX-06, sin tarjeta. La ruta index de `MisCursos` devolvía `null` para Profesor y Ayudante (página en blanco) y solo el enlace «Historial de notas» para el Alumno. Ahora es la lista completa de cursos del usuario, como «Todos los cursos» de Canvas; el Dashboard queda como resumen en tarjetas.

- Página `ListaMisCursos.tsx`: `PageHeader` («Mis cursos», con el período), buscador por código, nombre o sección (sin importar tildes, con botón para limpiar), contador «N cursos» (`aria-live`) y `DataTable`. Carga con esqueletos, vacío con `EmptyState` y error con `ErrorState` y reintento.
- Columnas: Curso (código y nombre, enlace a `/mis-cursos/secciones/:id` con el estilo `ENLACE`), Sección, Período, Horario y sala (mismo formato del Dashboard), y según el rol: Alumnos (Profesor); Profesores e «Inscrito como» con insignia (Ayudante y Alumno). La fila entera es clicable (`alHacerClic` en `DataTable`; un clic en un enlace o botón no lo dispara) y se resalta con el foco del enlace.
- Alumno: «Historial de notas» como botón secundario arriba a la derecha. Profesor: insignia con las evaluaciones pendientes de revisión (enlace a `pendientes-revision`) solo si hay.
- Datos: los mismos endpoints del Dashboard (`/api/dashboard/mis-secciones`, `secciones-ayudante`, `secciones-alumno`). Sin cambios de backend ni de `@cursus/shared`.
- Rutas hijas intactas: `historial`, `historial/:seccionId`, `secciones/:id` y `pendientes-revision`.

**Límites de los datos.** Los tres endpoints entregan solo el período activo (`p.activo`), así que no hay «Períodos anteriores» que agrupar y la columna Período muestra el activo. La respuesta del Ayudante no trae horario ni alumnos: su tabla no tiene esas columnas y muestra los profesores. Agregarlos pide cambiar el endpoint.

**Menú.** Ningún rol ve a la vez «Mis Cursos» (`/mis-cursos`) y el ítem de `/cursos`, que solo es «Mis Cursos» para Administrativo y Superadmin (para el Director es «Gestión académica»), así que no hay etiqueta repetida en un mismo menú y `navigation.ts` no cambia.

Capturas en [`evidencias/`](evidencias/): `ui-mis-cursos-<antes|despues>-<profesor|ayudante|alumno>-<1280|375>.png`.

## Dashboard docente (Profesor y Ayudante)

Fix sobre UI/UX-06, sin tarjeta. El Dashboard solo listaba tarjetas y «Mis cursos» repetía ese contenido. Profesor y Ayudante tienen pocos cursos, así que «Mis Cursos» sale de su menú lateral (filtro en `Sidebar.tsx`; `navigation.ts` y los permisos CASL no cambian) y `/mis-cursos` (ruta index) redirige al Dashboard con `replace`. Las rutas hijas (`secciones/:id`, `pendientes-revision`, `historial`) quedan intactas. El Alumno conserva «Mis Cursos» con su tabla.

El Dashboard pasa a ser un panel de trabajo (`DashboardDocente.tsx`), a dos columnas desde 1024 px (principal a la izquierda; fechas y horario a la derecha) y una en móvil. Cada bloque carga y falla por separado, con esqueletos y reintento:

- **Por revisar** (solo Profesor): igual que antes, con el conteo y el enlace a `pendientes-revision`.
- **Mis secciones del período**: tarjetas con alumnos (Profesor) o profesor a cargo (Ayudante), horario y seis accesos con tooltip a las pestañas Anuncios, Material, Entregas, Notas, Asistencia e Integrantes (`?vista=`).
- **Próximas fechas**: entregas con plazo en los próximos 14 días (sin cerradas), de todas sus secciones, con curso, título, fecha `dd-mm-aaaa` y enlace a la pestaña Entregas.
- **Horario de la semana**: grilla de lunes a sábado (y el domingo, si tiene bloques) con los bloques de todas sus secciones y el día de hoy destacado.
- **Actividad reciente**: los últimos 3 anuncios de sus cursos (los de curso se cuentan una vez).

**Datos.** Sin endpoints nuevos: `mis-secciones` / `secciones-ayudante` y, por sección (`useDeSecciones`, en paralelo), `actividades` y `anuncios`; para el horario del Ayudante, el `resumen` de cada sección. No hay endpoints que junten las de todas las secciones, así que son 2 consultas por sección (3 para el Ayudante).

**Fuera por falta de datos.** «Por revisar» del Ayudante: `pendientes-revision` es solo del Profesor y no hay equivalente de envíos devueltos. Número de alumnos en las tarjetas del Ayudante: su lista no lo trae.

Capturas en [`evidencias/`](evidencias/): `ui-dashboard-docente-<antes|despues>-<profesor|ayudante>-<1280|375>.png`.

## Evidencias

Capturas antes y después en 1280, 1920 y 375 px de cada pestaña, y de los diálogos (subir material, sílabo, nuevo anuncio, crear actividad, calendario y período terminado), en [`evidencias/`](evidencias/) como `ui-curso-profesor-<antes|despues>-<estado>-<ancho>.png`. Los anuncios, materiales, versiones del sílabo y la actividad se crearon por la aplicación en la base local.

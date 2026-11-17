# Vistas del Director: búsqueda y filtros

Fix sobre UI/UX-08 (ya mergeada), sin tarjeta propia. Pule Dashboard, Indicadores, Registro de accesos, Universidades y Gestión académica del Director: tablas con búsqueda, filtros, orden y paginación, enlaces sobrios y el menú lateral con un estado activo más liviano. No cambia backend, seed, `@cursus/shared` ni permisos CASL. En `navigation.ts` solo se agrega la página de `/universidades` (ver hallazgo 1).

## Hallazgos

Recorrido como Director (`director@norte.cursus.test`) en Dashboard, Indicadores, Registro de accesos, Universidades y Gestión académica, a 1280 y 375 px. Capturas en [`evidencias/`](evidencias/) como `ui-director-filtros-antes-<pantalla>-<ancho>.png`.

**Universidades**

1. `/universidades` mostraba solo el App Shell. Causa: el ítem de `navigation.ts` no tenía `page` («Sin página, la ruta muestra solo el App Shell»). Los datos ya existían: `GET /api/metricas/universidades` (el mismo del Dashboard y de «Comparar universidades») trae cada universidad con aprobación, promedio, asistencia y alumnos.

**Dashboard e Indicadores**

2. Las universidades eran una línea de texto corrida («Aprobación: Sin datos suficientes · Promedio: … · Asistencia: …») con el nombre subrayado. La frase «Sin datos suficientes» se repetía tres veces por fila.
3. Los enlaces de Indicadores y los códigos de Gestión académica iban en negrita o con subrayado fijo.

**Gestión académica (vista del Director)**

4. Sin búsqueda ni filtros: los 19 cursos (y en el seed del equipo más, de varios períodos) en una sola tabla.
5. El subtítulo decía «Período 2026-X» aunque la tabla mezclaba períodos (en el seed del equipo, cursos 2026-2 y un curso «Demo» sin secciones con el subtítulo en 2026-1).
6. Universidad y Período no se podían ordenar; sin paginación ni cabecera fija.

**Registro de accesos**

7. `<select>` e `<input type="date">` nativos sin estilo («dd-mm-yyyy» del navegador) y botones «Anterior/Siguiente» del navegador.
8. Fecha en cada fila con segundos, «p. m.» y la zona («15-11-2026, 11:47:16 p. m. CLST»).
9. El resultado era texto plano: un fallido no se distinguía de un exitoso. El nombre del usuario iba subrayado como enlace.
10. La API (`GET /api/auditoria/eventos`) solo acepta `tipo`, `universidadId`, `usuarioId`, `desde`, `hasta`, `pagina` y `tamano`: no filtra por resultado ni busca por texto, y el registro tiene varias páginas (12 en local).

**Menú y tablas (todas las pantallas)**

11. El ítem activo del menú lateral era un bloque sólido del color de la universidad y, con el teclado, un anillo con desplazamiento encima (doble contorno).
12. Las filas de las tablas usaban `border-b` sin color: sin preflight, el borde salía del color del texto (oscuro). Las cabeceras iban en el color del texto y los números alineados a la izquierda.

**Consola**: sin avisos de React; solo el 401 del refresco de sesión al cargar.

## Qué cambia

### 1. Universidades

- Nueva página `pages/Universidades.tsx` con selector de período (el mismo de Indicadores) y una tabla: universidad, aprobación, promedio, asistencia y alumnos. El nombre lleva al detalle existente `/indicadores/universidades/:id`, conservando `?periodo`. Estados de carga, vacío y error.
- `navigation.ts`: solo se agrega `page: Universidades`; el permiso (`read PanelDirectorio`) y el resto quedan igual.

### 2. Tabla de universidades compartida

- `pages/TablaUniversidades.tsx`: una sola tabla para Dashboard, Indicadores y Universidades (sobre `DataTable`), ordenable por columna.
- Enlace: `font-medium`, color primario, sin subrayado fijo, subrayado al pasar el mouse y anillo de foco con el teclado. Al final de la fila, un `ChevronRight`.
- Un indicador sin datos es un guion con tooltip «Sin datos suficientes» (y el texto para lectores de pantalla), no la frase en cada celda.
- `ENLACE` (`indicadores-formato.ts`) pasa a ese estilo, así que también cambian los enlaces de facultades, carreras y cursos de Indicadores y los códigos de Gestión académica. `ResumenEnLinea` se elimina.

### 3. Gestión académica del Director

- `pages/CursosDirector.tsx`: barra con buscador (nombre o código, sin importar tildes, con botón para limpiar), filtros Universidad, Carrera (acotada a la universidad) y Período (`NativeSelect`), contador «N de M cursos» con `aria-live`, chips de los filtros activos y «Limpiar filtros».
- El período parte en el activo de la universidad del Director y el subtítulo dice el elegido («Período 2026-2» o «Todos los períodos»).
- La API entrega la lista completa, así que buscar, filtrar, ordenar y paginar es en el cliente sin perder datos.
- Todas las columnas se ordenan (`aria-sort`), 25 por página con «Anterior/Siguiente», cabecera fija desde 768 px. Sin resultados: estado vacío con «Limpiar filtros». Carga: esqueletos.
- La vista del Administrativo no cambia.

### 4. Registro de accesos

- Filtros con shadcn: Tipo de evento, Resultado y Universidad (`NativeSelect`), Desde y Hasta con DatePicker (Popover + Calendar en español, semana desde el lunes, sin dejar «desde» después de «hasta»), y atajos «Últimas 24 horas», «7 días» y «30 días».
- Todo vive en la URL (`tipo`, `universidad`, `usuario`, `desde`, `hasta`, `ultimas`, `pagina`): se comparte y sobrevive a recargar. Un atajo se guarda como `ultimas=24h|7d|30d` y se calcula al cargar, así un enlace sigue mostrando lo reciente. «Limpiar filtros» los quita todos.
- **Búsqueda por usuario o IP y filtro por resultado: deshabilitados.** La API no los acepta y el registro tiene varias páginas; filtrar solo la página visible mostraría resultados incompletos. Una nota bajo los filtros lo explica (y es la descripción accesible de ambos controles).
- Tabla: evento con ícono, resultado como insignia (Exitoso en verde sobrio, Fallido y Bloqueado en rojo, con la fila en un fondo rojo tenue), fecha `15-11-2026 23:37` (24 h, `formatearFechaHora`) y la zona horaria en una sola nota arriba. Usuario con el rol debajo como texto secundario, sin subrayado (sigue filtrando por él al hacer clic); «Sin cuenta» en gris.
- Pie con «Página X de Y» y «Anterior/Siguiente»; arriba, el total de eventos. La lógica de paginación (página en la URL, salida de una página fuera de rango) se mantiene.
- «Exportar CSV» descarga las filas de la página visible (con los filtros aplicados), hecho en el cliente, separado por `;` y con BOM para Excel.
- Se borra `RegistroAccesos.css`.

### 5. Menú y tablas

- Menú lateral (todos los roles): el ítem activo lleva fondo tenue del color de la universidad, texto en negrita y una barra fina a la izquierda. El foco es un anillo fino solo con el teclado (`focus-visible`), sin desplazamiento.
- `components/ui/table.tsx`: bordes finos con `border-border`, cabeceras en peso medio y texto secundario, celdas con más alto. Los números de estas pantallas van a la derecha con `tabular-nums`.
- `DataTable`: paginación opcional en el cliente (`porPagina`), cabecera fija opcional (`cabeceraFija`), texto de carga configurable y encabezados que aceptan un nodo.

## Lo que el backend no permite

- `GET /api/auditoria/eventos` no filtra por **resultado** ni busca por **texto** (usuario, correo o IP). Para habilitarlos haría falta aceptar `resultado` y `q` en `FiltroEventosDto` y en la consulta del servicio.
- No hay endpoint para editar o archivar desde la vista del Director (es de solo lectura por diseño).

## Pendiente

- La cabecera fija de las tablas aplica dentro de la tabla (alto máximo de 70 % de la ventana), no contra el desplazamiento de la página.
- Las tablas de facultades y carreras de Indicadores siguen como tarjetas (fuera del alcance de esta tarea).

## Evidencias

Antes y después en 1280 y 375 px en [`evidencias/`](evidencias/): `ui-director-filtros-<antes|despues>-<pantalla>-<ancho>.png` (dashboard, indicadores, universidades, cursos, accesos y, después, cursos filtrados, cursos sin resultados, accesos filtrados por tipo y el calendario).

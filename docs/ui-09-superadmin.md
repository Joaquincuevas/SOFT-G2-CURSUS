# UI/UX-09: experiencia del Superadmin con shadcn

Tarjeta: UI/UX-09 · UI/UX Superadmin (shadcn). Deja pulida la experiencia del rol Superadmin con shadcn y las primitivas compartidas de UI/UX-03. No cambia permisos, rutas, endpoints, backend ni `@cursus/shared`; `navigation.ts` y el AppShell quedan como estaban.

## Recorrido inicial

Recorrido de todas las pantallas del rol antes de migrar, con la aplicación local, a 1280 y 375 px. Las capturas están en [`evidencias/`](evidencias/) como `ui-09-antes-<pantalla>-<ancho>.png`.

**Cómo se hizo.** El seed no trae una cuenta Superadmin. Se creó en la base local con `npm run superadmin --workspace=backend` (`superadmin@cursus.test`, como indica [MT-04](mt-04-superadmin.md)) y se marcó su contraseña como definitiva para poder navegar sin pasar por el cambio obligatorio. Las pantallas con la sesión «sin elegir» se vieron antes de elegir facultad; después se eligió Ingeniería de Universidad Demo Norte. Los estados de carga y error se simularon en el navegador (respuesta demorada y respuesta 500).

**Qué permite su permiso CASL.** `read PanelSuperadmin` (Dashboard y `/superadmin/universidades/:id[/cuentas]`), `create/update Universidad` y `Facultad`, y los mismos permisos del Administrativo sobre Carrera, Período, Curso, Sección, Inscripción y Usuario. No tiene `Metricas`, `RegistroAccesos`, `PanelDirectorio` ni `ReporteMetricasFacultad`.

**Menú y encabezado.** El menú muestra Dashboard, Mis Cursos, Carreras, Períodos y Profesores y ayudantes. El encabezado dice «Bienvenido/a, <nombre>» en el Dashboard y, con una facultad elegida, suma el semestre y el pie del menú nombra la universidad y la facultad. Las rutas de otro rol (por ejemplo `/indicadores`) vuelven al Dashboard y una ruta que no existe muestra la 404. Funciona igual a 375 px (menú en el cajón).

### Pantallas

| Pantalla | Ruta | Dueña | Captura 1280 / 375 |
| --- | --- | --- | --- |
| Dashboard (universidades y facultades) | `/` | UI/UX-09 | `panel` |
| Nueva universidad | `/` (formulario abierto) | UI/UX-09 (el formulario lo comparte con 07) | `panel-nueva` |
| Dashboard cargando / con error / sin universidades | `/` | UI/UX-09 | `panel-carga`, `panel-error`, `panel-vacio` |
| Dashboard con una facultad elegida | `/` | UI/UX-09 | `panel-con-contexto` |
| Vistas del Administrativo sin elegir universidad | `/cursos`, `/carreras`, `/periodos`, `/docentes`, `/secciones` | UI/UX-09 (el aviso); las páginas son de otras tarjetas | `cursos-sin-contexto`, `carreras-sin-contexto`, `periodos-sin-contexto`, `docentes-sin-contexto`, `secciones-sin-contexto` |
| Las mismas con una facultad elegida | las anteriores | solo se verifican | `contexto-elegido`, `cursos-con-contexto`, `carreras-con-contexto`, `periodos-con-contexto`, `docentes-con-contexto`, `secciones-con-contexto` |
| Administrar universidad | `/superadmin/universidades/:id` | UI/UX-07 (solo se verifica) | `administrar` |
| Cuentas de una universidad | `/superadmin/universidades/:id/cuentas` | UI/UX-07 (solo se verifica) | `cuentas` |
| Mi perfil | `/perfil` | compartida (solo se verifica) | `perfil` |
| Ruta de otro rol / ruta inexistente | `/indicadores`, `/no-existe` | solo se verifica | `ruta-de-otro-rol`, `ruta-inexistente` |

### Hallazgos

**Dashboard (`PanelSuperadmin`, de esta tarjeta)**

1. Usa tres hojas de estilo propias (`Dashboard.css`, `Carreras.css`, `PanelSuperadmin.css`) y botones y enlaces sin los componentes de shadcn.
2. Cargando muestra el spinner genérico; sin universidades dice «Todavía no hay universidades.» como texto suelto, sin ninguna acción para crear la primera.
3. Los mensajes de aviso y de error (universidad creada, no se pudo entrar a la facultad) son texto plano, sin ícono ni el color de alerta.
4. La etiqueta «Trabajando aquí» ocupa mucho de la fila angosta y parte el nombre de la facultad en dos líneas.
5. No hay forma de llegar a las cuentas de una universidad desde el Dashboard: solo se llega con Administrar → «Administrar cuentas».
6. No dice cuántas universidades y facultades hay.
7. El formulario de nueva universidad (`FormularioUniversidad`) muestra el selector de color como una barra gris a todo el ancho, sin el valor elegido, y su error de contraste es texto plano.

**Aviso «Elige una universidad primero»** (`AvisoElegirFacultad`, de esta tarjeta; solo lo ve el Superadmin)

8. Funciona y lleva al Dashboard, pero usa los estilos de `estados.css` y queda pegado a la izquierda, sin el ícono ni las cards del resto.

**Menú, encabezado y rutas**

9. Sin hallazgos de comportamiento: menú, encabezado, 404 y redirección de rutas de otro rol son correctos para el rol, a 1280 y 375 px.
10. Observaciones de `navigation.ts`, que no se cambia: el ítem de `/cursos` se llama «Mis Cursos» para el Superadmin, aunque la página se titula «Gestión académica» y no tiene cursos propios; y el menú dice «Dashboard» (en inglés) para todos los roles, como en el Figma. `/secciones` no está en el menú y para el Superadmin muestra Gestión académica.

**Páginas de UI/UX-07 (solo se verifican, no se tocan)**

11. Administrar universidad: el encabezado de la tarjeta de facultades se repite («Facultades» y «Facultades de Universidad Demo Norte»); el campo «Nueva facultad» no tiene texto de ayuda; hereda el selector de color de la observación 7.
12. Cuentas de universidad: lista todas las cuentas en una sola página, sin paginación ni búsqueda (11 193 px de alto a 1280 px y 16 551 px a 375 px con las 70 cuentas del seed); tiene dos `<select>` nativos; la tabla de seis columnas queda muy apretada a 375 px.
13. Carreras, Períodos y Cursos con una facultad elegida funcionan, con selectores nativos y botones con el estilo anterior.

**Consola, textos y contraste**

14. Sin avisos de React ni errores en consola; solo aparecen los mensajes de red del refresco de sesión (401) y de las respuestas simuladas.
15. Sin textos en inglés, salvo «Dashboard» (hallazgo 10).
16. Las páginas que no son de esta tarjeta no se midieron en contraste; los colores nuevos del Dashboard se miden en `panel-superadmin-contraste.test.ts` con cinco colores de universidad.

# UI/UX-08: experiencia del Director con shadcn

Tarjeta: UI/UX-08 · UI/UX Director (shadcn). Rediseña el dashboard del Director, Indicadores y el Reporte de facultad con los componentes de shadcn y las primitivas compartidas de UI/UX-03. No cambia permisos, rutas, endpoints ni `@cursus/shared`. El Director conserva el azul de CURSUS (`#1b4f72`): no toma el color de la universidad.

## Qué cambia

- **Dashboard del Director** (`pages/DashboardDirector.tsx`, antes en blanco). Solo usa endpoints que ya existen:
  - `GET /api/metricas/consolidado`: los indicadores clave (aprobación, promedio, asistencia) y los conteos de alumnos y cursos del período activo.
  - `GET /api/metricas/universidades`: cada universidad con sus tres indicadores, con enlace a sus facultades.
  - Accesos directos a **Indicadores**, **Comparar universidades** y **Registro de accesos** (los tres ya son del Director).
- **Indicadores** (`pages/Indicadores.tsx`, las seis pantallas del drill-down): `Card` para cada indicador, `Table` para cursos y distribución, `Tabs` en la comparación (Tabla y Gráfico), `Breadcrumb` para la ruta, `Skeleton` al cargar, y `EmptyState`/`ErrorState` para vacío y error. Se borra `Indicadores.css`.
- **Reporte de facultad** (`pages/ReporteFacultad.tsx`): `Table` con la carrera como fila de grupo y sus cursos debajo. Se borra `ReporteFacultad.css`. **Corrige el aviso de `key`** de React: el grupo de filas de cada carrera era un `<>` sin `key`; ahora es `<Fragment key={carrera.id}>`.
- **Selectores y enlaces:** el período y el indicador a graficar siguen siendo `<select>` (con `NativeSelect` y su etiqueta, vía `FormField`), así que los tests con `selectOptions` no cambian. Los enlaces de texto van con el azul de CURSUS y subrayado (antes tomaban el estilo por defecto del navegador).

## Piezas

- `pages/indicadores-comunes.tsx`: selector de período, ruta de navegación, tarjeta de indicador, esqueletos y avisos que comparten el dashboard y Indicadores.
- `pages/indicadores-formato.ts`: formato es-CL de los valores, plural, el período en la URL y el estilo de enlace.
- Se reutilizan `PageHeader`, `EmptyState`, `ErrorState`, `DataTable` y `FormField`. No se agregó nada a `components/ui/` ni a `components/shared/`.

## Estados

| Pantalla | Cargando | Vacío | Error |
| --- | --- | --- | --- |
| Dashboard | Esqueletos de las tarjetas y de las universidades, cada bloque por su cuenta | «No hay universidades.» | «No pudimos cargar los indicadores.» o «…las universidades.», con Reintentar, sin esconder lo demás |
| Indicadores y niveles | Esqueletos con el texto «Cargando …» para lectores de pantalla | Sin universidades, facultades, carreras, cursos o notas finales: dice qué falta | Reintentar; la universidad, facultad, carrera o curso que no existe lleva un enlace de vuelta |
| Reporte | Esqueletos | «Tu facultad no tiene carreras para este período.» | Reintentar; un período inválido ofrece volver al activo |

Un indicador sin denominador dice «Sin datos suficientes» en vez de mostrar 0.

## Accesibilidad

- Cada color de texto cumple AA con el azul de CURSUS (`pages/indicadores-contraste.test.ts` mide los pares que se pintan; las barras y la línea de aprobación, 3:1).
- Los encabezados de las tablas ordenables son botones con `aria-sort`; el gráfico de barras y el histograma tienen su tabla equivalente.
- Tabs con teclado (flechas), foco visible en enlaces, selectores y botones.

## Lo que no se hizo

- **Reporte de facultad en el dashboard del Director:** el reporte (MET-08) es del Administrativo. El permiso `read ReporteMetricasFacultad` no lo tiene el Director (`shared/src/permisos.ts`) y el backend le responde 403, así que el acceso directo no se ofrece. Ofrecerlo exigiría cambiar permisos o el backend, fuera de esta tarjeta.
- **Gráficos con Recharts:** no se agregaron. Las barras y el histograma siguen siendo de CSS, ahora con Tailwind.

## Evidencias

Capturas antes y después a 1280 y 375 px en [`evidencias/`](evidencias/) (`ui-08-antes-*` y `ui-08-despues-*`). Los indicadores con valores, el histograma y la comparación se capturaron con la respuesta de la API completada con datos de ejemplo, porque el seed no tiene notas ni asistencia registradas; el resto, con el seed tal cual.

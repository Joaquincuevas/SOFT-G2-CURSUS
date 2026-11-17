# Breadcrumb completo del encabezado

Fix de UI, sin tarjeta. El encabezado mostraba «Inicio › título» y en las rutas profundas (curso → sección → vista, el drill-down del Director, el detalle de un curso) no había cómo volver a un nivel intermedio. Ahora muestra el camino completo, para todos los roles.

## Cómo funciona

- **Pasos fijos** (`layout/migas.ts`, `migasDe`): salen de `NAV_ITEMS` (título y ruta de la sección del menú) y de las pocas subrutas con nombre propio («Historial», «Nuevo curso», «Cursos archivados», «Comparar universidades», «Pendientes»).
- **Pasos con nombre de datos**: cada página los registra con `useMigas([...])` (`layout/migas-contexto.ts`), a partir de lo que ya cargó. Sin fetch ni endpoints nuevos. Mientras el nombre no llega, el paso es un esqueleto («Cargando…» para lectores de pantalla): nunca un id.
- **Un solo contexto**: `MigasProvider` guarda los pasos de la página y el encabezado los combina con los fijos. Si la página repite el primer paso fijo (por ejemplo «Indicadores», con el período en su enlace), lo reemplaza. `Migas` de `indicadores-comunes.tsx` ya no dibuja nada en la página: registra su camino en el encabezado.
- **Encabezado** (`layout/Header.tsx`): `<nav aria-label="Breadcrumb">`; cada paso intermedio es un enlace; el último es el h1, con `aria-current="page"` y sin enlace. «Inicio» va a `/`, el Dashboard de cada rol. Nombres largos con puntos suspensivos y el nombre completo en un tooltip.
- **Ruta larga** (más de 4 pasos): quedan Inicio, el penúltimo y el último; los de en medio van a un menú «…» (`BreadcrumbEllipsis` en un `DropdownMenu`) con sus enlaces.
- **Pantallas angostas**: «‹ paso anterior» (enlace) sobre el título actual; sin scroll horizontal.
- **Vista del curso**: el último paso es la vista de `?vista=` (Anuncios, Material…); en el Home, la sección.

## Rutas cubiertas

| Rol                 | Ejemplos                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Todos               | `/perfil`: Inicio › Mi perfil                                                                                                                                                                                       |
| Director            | `/indicadores`, `/accesos`, `/universidades`, `/cursos` (Gestión académica), `/indicadores/comparar`, el drill-down Indicadores › universidad › facultad › carrera › curso (con menú «…»), `/secciones/:id/alumnos` |
| Administrativo      | `/carreras`, `/periodos`, `/docentes`, `/reporte-facultad`, `/cursos`, `/cursos/nuevo`, `/cursos/:id`, `/cursos/:id/editar`, `/cursos/archivados`, `/cursos/archivados/:id`, `/secciones/:id/integrantes`           |
| Profesor y Ayudante | Inicio › sección › vista (sin «Mis Cursos», que no existe para su rol), `/mis-cursos/pendientes-revision`                                                                                                           |
| Alumno              | Inicio › Mis Cursos › sección › vista, `/mis-cursos/historial`, `/mis-cursos/historial/:seccionId`                                                                                                                  |
| Superadmin          | `/superadmin`, `/superadmin/universidades/:id` (Administrar universidad › nombre)                                                                                                                                   |
| Sin AppShell        | `/login`, `/recuperar-password`, `/restablecer-password` y el cambio obligatorio de contraseña no tienen encabezado                                                                                                 |

## Rutas con jerarquía ambigua

- **«Inicio › Notas › Entrega 1»** (el ejemplo del pedido): las evaluaciones y las entregas no son rutas, sino estado dentro de la vista Notas o Entregas. El camino termina en la vista; el nombre de la evaluación no se agrega.
- **Profesor y Ayudante en `/mis-cursos`**: la ruta redirige al Dashboard, así que la sección cuelga de Inicio.
- **`/secciones/:id/integrantes` y `/alumnos`** (no están en el menú): cuelgan de la gestión de cursos y del curso de la sección.
- **`/cursos/archivados/:id`**: el enlace a «Cursos archivados» no conserva los filtros de la lista.
- **Egresado**: solo ve su historial, sin Inicio (volvería a donde ya está).

Capturas en [`evidencias/`](evidencias/): `ui-breadcrumbs-<antes|despues>-<rol>-<corta|larga>-<1280|375>.png`.

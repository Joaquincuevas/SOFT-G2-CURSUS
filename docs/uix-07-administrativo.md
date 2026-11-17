# UI/UX-07 · Experiencia del Administrativo

El dashboard muestra la universidad, facultad y período de la sesión. Cuenta los cursos vigentes de la facultad para el período activo con `GET /api/cursos` y las cuentas vigentes de profesores de la universidad con `GET /api/profesores`. Sin período activo, el primer total incluye todos los cursos vigentes de la facultad. El segundo total incluye profesores y su etiqueta indica el alcance. Las acciones rápidas respetan los permisos de la sesión.

## Recorrido con el seed local

1. Aplica las migraciones y carga el seed. Entra como `administrativo.ingenieria@norte.cursus.test` y `administrativo@sur.cursus.test` con la contraseña del seed. Comprueba el nombre de la facultad, los totales y el destino de los accesos directos.
2. Desde **Gestionar cursos**, usa los filtros nativos de carrera y período, ordena una columna y abre un curso. Crea un curso de prueba. Confirma que vuelva al listado y aparezca el aviso de éxito. Desde **Archivados** se accede al flujo existente.
3. Entra con una cuenta Superadmin de prueba según el README. En el dashboard elige **Administrar** para Universidad Demo Norte y revisa la tabla de facultades, la edición de datos y la confirmación de archivo. La confirmación de universidad muestra la cantidad de cuentas afectadas y exige un motivo.
4. Desde **Administrar cuentas**, busca a Matías Muñoz y filtra por profesor. Abre y cancela su edición y la confirmación de archivo. Para probar una escritura, usa una cuenta de demo nueva. Al crearla, la contraseña provisoria se muestra una sola vez.
5. Repite a **1280 px** y **375 px**. En móvil, Cursos muestra carrera y período junto al nombre. Cuentas reúne correo, rol y facultad bajo el nombre y mantiene las acciones al lado de la cuenta.

## Contraste institucional

Se midieron el texto y fondo del encabezado y del botón **Crear curso** en Chrome, en ambas resoluciones.

| Universidad | Fondo     | Contraste |
| ----------- | --------- | --------- |
| Demo Norte  | `#1b4f72` | 8,72:1    |
| Demo Sur    | `#0a5c36` | 8,09:1    |

## Capturas

| Vista                   | 1280 px                                                  | 375 px                                             |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Dashboard Norte         | [Escritorio](evidencias/uix-07-dashboard-norte-1280.png) | [Móvil](evidencias/uix-07-dashboard-norte-375.png) |
| Dashboard Sur           | [Escritorio](evidencias/uix-07-dashboard-sur-1280.png)   | [Móvil](evidencias/uix-07-dashboard-sur-375.png)   |
| Cursos                  | [Escritorio](evidencias/uix-07-cursos-1280.png)          | [Móvil](evidencias/uix-07-cursos-375.png)          |
| Crear curso             | [Escritorio](evidencias/uix-07-crear-curso-1280.png)     | [Móvil](evidencias/uix-07-crear-curso-375.png)     |
| Administrar universidad | [Escritorio](evidencias/uix-07-universidad-1280.png)     | [Móvil](evidencias/uix-07-universidad-375.png)     |
| Cuentas filtradas       | [Escritorio](evidencias/uix-07-cuentas-1280.png)         | [Móvil](evidencias/uix-07-cuentas-375.png)         |
| Editar cuenta           | [Escritorio](evidencias/uix-07-editar-cuenta-1280.png)   | [Móvil](evidencias/uix-07-editar-cuenta-375.png)   |

## Ajuste posterior: formularios en diálogo, panel Pendientes y menú

Fix sobre UI/UX-07, sin tarjeta.

- **`FormDialog`** (`components/shared/FormDialog.tsx`), sobre shadcn `Dialog`: título, campos, error del servidor dentro del diálogo, «Guardar» (con progreso) y «Cancelar». Escape, clic fuera, la X y Cancelar lo cierran; el foco parte en el primer campo; mientras guarda no se puede cerrar; con cambios sin guardar pide confirmar (`ConfirmDialog`). En pantallas angostas el contenido se desplaza dentro del diálogo (`max-h` de la altura visible).
- **Carreras** y **Períodos** pasan del panel lateral a «Nueva carrera» / «Editar» y «Nuevo período» (en el `PageHeader`), con la tabla (`DataTable`) a todo el ancho. Tras guardar se cierra, se vuelve a pedir el listado y sale un aviso (`toast`). Se quitan «Actualizar listado» y los CSS de ambas páginas. En Períodos, «Activar» sigue en la fila (la API no edita períodos).
- **Fuera de este cambio:** Profesores y ayudantes (`/docentes`) y Cursos (`/cursos/nuevo`, edición) no tienen panel lateral: son páginas de un solo formulario (el de cursos con secciones y horarios), así que siguen como están.
- **Dashboard:** se quita «Accesos directos» (repetía el menú) y se agrega **Pendientes** con los endpoints existentes: el detalle de cada curso del período activo (`/api/cursos/:id`) y `/api/periodos`. Cuenta secciones sin profesor, sin horario y sin alumnos (con enlace a los primeros cursos afectados) y avisa el período activo que termina en 14 días o menos, que ya terminó, o la falta de uno. Sin pendientes: «Todo al día». Son una consulta por curso, porque no hay un endpoint que junte las secciones.
- **Menú:** «Mis Cursos» pasa a **«Gestión de cursos»** para el Administrativo (el Director sigue con «Gestión académica»). «Carreras» y «Períodos» van bajo el encabezado **«Configuración»** (`grupo` en `navigation.ts` y un encabezado en `Sidebar.tsx`); «Profesores y ayudantes» pasa antes, para que el grupo quede al final.
- Se borra `ProfesoresSeccion 3.bak`, un archivo huérfano.

Capturas en [`evidencias/`](evidencias/): `ui-administrativo-<antes|despues>-<dashboard|carreras|menu>-<1280|375>.png` y, después, `carreras-modal-<editar|nueva>`.
